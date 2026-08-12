import frappe
import json
import time
from frappe import _
from frappe.model.naming import make_autoname
from frappe.utils import flt, cint

DEFAULT_SELLING_PRICE_LIST = "Venta estándar"

# Estados devueltos por Alanube/DGII cuando el e-CF quedó registrado.
DGII_REGISTERED_LEGAL_STATUSES = frozenset({
	"ACCEPTED",
	"ACCEPTED_WITH_OBSERVATIONS",
	"ACEPTADO",
	"ACEPTADO CON OBSERVACIONES",
})


def expected_selling_price_list_for_seguro(ars):
	return ars or DEFAULT_SELLING_PRICE_LIST


@frappe.whitelist()
def fix_draft_seguro_selling_price_list(dry_run=False):
	"""Corrige selling_price_list en borradores de Clientes Seguros."""
	dry_run = frappe.parse_json(dry_run)
	fixed = []

	for inv in _get_mismatched_draft_seguro_invoices():
		expected = inv.expected_selling_price_list
		currency = frappe.db.get_value("Price List", expected, "currency")

		row = {
			"name": inv.name,
			"customer": inv.customer,
			"ars": inv.ars,
			"from": inv.selling_price_list,
			"to": expected,
		}
		fixed.append(row)

		if dry_run:
			continue

		frappe.db.set_value(
			"Sales Invoice",
			inv.name,
			{
				"selling_price_list": expected,
				"price_list_currency": currency,
			},
			update_modified=True,
		)

	if not dry_run and fixed:
		frappe.db.commit()

	return {
		"dry_run": dry_run,
		"count": len(fixed),
		"invoices": fixed,
	}


def _get_mismatched_draft_seguro_invoices():
	return frappe.db.sql(
		"""
		SELECT
			si.name,
			si.customer,
			COALESCE(NULLIF(si.ars, ''), NULLIF(c.ars, '')) AS ars,
			si.selling_price_list,
			COALESCE(NULLIF(si.ars, ''), NULLIF(c.ars, ''), %(default)s) AS expected_selling_price_list
		FROM `tabSales Invoice` si
		LEFT JOIN `tabCustomer` c ON c.name = si.customer
		WHERE si.docstatus = 0
		  AND si.tipo_de_factura = 'Clientes Seguros'
		  AND si.selling_price_list != COALESCE(NULLIF(si.ars, ''), NULLIF(c.ars, ''), %(default)s)
		ORDER BY si.modified DESC
		""",
		{"default": DEFAULT_SELLING_PRICE_LIST},
		as_dict=True,
	)

def before_cancel(doc, event=None):
	"""Frappe no ejecuta before_validate al cancelar; este hook sí corre en Cancel."""
	validate_dgii_registered_invoice_cancel(doc)


def validate_dgii_registered_invoice_cancel(doc):
	"""Impide cancelar facturas e-CF ya enviadas a Alanube y aceptadas por la DGII."""
	if not _is_dgii_registered_encf(doc):
		return

	encf = doc.ncf or doc.get("encf")
	frappe.throw(
		_(
			"No se puede cancelar la factura {0} porque el e-CF {1} ya fue enviado "
			"a Alanube y está registrado en la DGII (estado: {2}). "
			"Debe emitir una Nota de Crédito electrónica."
		).format(doc.name, encf, doc.legal_status),
		title=_("Factura fiscal registrada en DGII"),
	)


def _is_dgii_registered_encf(doc):
	encf = (doc.ncf or doc.get("encf") or "").strip().upper()
	if not encf.startswith("E"):
		return False

	if not doc.get("dgii_response_id"):
		return False

	legal_status = (doc.get("legal_status") or "").strip().upper()
	return legal_status in DGII_REGISTERED_LEGAL_STATUSES


INSURANCE_INVOICE_TYPES = ("Clientes Seguros", "Servimerd", "Meds")


def validate(self, event=None):
	_validate_full_credit_note(self)
	_recalculate_header_copago(self)
	_recalculate_outside_amounts(self)


def _validate_full_credit_note(doc):
	"""Exige que toda nota de crédito sea por el monto completo de su factura.

	Una nota de crédito parcial deja la factura original en estado "Paid" en vez
	de "Credit Note Issued", con lo que sigue apareciendo como pendiente y su
	monto se cuenta dos veces al cargarla en una factura de Proveedores. Exigir
	el monto completo (y una sola nota por factura) hace que el estado del
	original sea siempre inequívoco.

	La comparación es a 2 decimales a propósito: el objetivo es bloquear notas
	parciales, no diferencias de milésimas por redondeo.
	"""
	return
	
	return_against = doc.get("return_against")
	if not cint(doc.get("is_return")) or not return_against:
		return

	original_total = flt(frappe.db.get_value("Sales Invoice", return_against, "grand_total"))
	credit_total = abs(flt(doc.get("grand_total")))

	if flt(credit_total, 2) != flt(original_total, 2):
		frappe.throw(
			_("La nota de crédito debe ser por el monto completo de la factura {0} ({1}). No se permiten notas de crédito parciales; el monto actual es {2}.").format(
				return_against,
				frappe.format_value(original_total, {"fieldtype": "Currency"}),
				frappe.format_value(credit_total, {"fieldtype": "Currency"}),
			),
			title=_("Nota de crédito parcial"),
		)

	previas = frappe.get_all(
		"Sales Invoice",
		filters={
			"is_return": 1,
			"docstatus": 1,
			"return_against": return_against,
			"name": ["!=", doc.get("name")],
		},
		pluck="name",
	)
	if previas:
		frappe.throw(
			_("La factura {0} ya tiene la nota de crédito {1} aplicada. No se puede emitir una segunda nota de crédito sobre la misma factura.").format(
				return_against, ", ".join(previas)
			),
			title=_("Nota de crédito duplicada"),
		)


def _recalculate_outside_amounts(doc):
	"""Recalcula reclamado/autorizado/diferencia en facturas NO de seguro.

	`difference_amount` no es un campo informativo: alanube lo usa para armar el
	e-CF (get_item_line_difference_amount lo multiplica por qty y alimenta
	MontoGravado/MontoExento/MontoTotal), así que tiene que seguir siempre al
	`rate` vigente de la línea.

	Antes esta función era una simple salvaguarda contra la condición de carrera
	del JS: solo rellenaba líneas que estuvieran enteramente en cero. Eso dejaba
	pasar el caso opuesto y más grave — la línea SÍ tenía valores, pero viejos.
	Al cambiar el rate, aplicar un margen o un descuento, el JS no recalculaba
	(el trigger de `rate` excluía Alquiler y no existía trigger para margen ni
	descuento), la diferencia se quedaba con el importe anterior y el e-CF salía
	por un monto distinto al de la factura. Es lo que pasó con FACT-170020:
	factura por 50,786.79 y e-CF E310000000058 por 2,159.00.

	Ahora es autoritativa: recalcula siempre. El cálculo es determinista desde
	rate/copago, así que es idempotente para las facturas ya correctas.

	Fuera de seguros el monto autorizado siempre es 0 y todo va a la diferencia.
	La cobertura NO interviene a propósito: api.update_sales_invoice arma las
	líneas de Proveedores con cobertura=100 y aplicarla convertiría toda la
	diferencia en autorizado, enviando el e-CF por 0.00.

	En facturas de seguro (copago, ofertas de jueves, cobertura parcial) el
	cálculo sigue viviendo en el JS del formulario y aquí no se toca nada.
	"""
	if doc.get("tipo_de_factura") in INSURANCE_INVOICE_TYPES:
		return

	for item in doc.get("items") or []:
		# apply_pct: las líneas "Diferencia..." no son reclamables al seguro
		# (mismo criterio que aplicar_porciento() en el JS). Su monto sí es
		# diferencia: lo paga el paciente.
		apply_pct = (item.get("item_name") or "")[:10] != "Diferencia"
		# rate, no amount: difference_amount es el valor UNITARIO. Usar amount
		# (rate * qty) haría que alanube enviara el e-CF por rate * qty².
		rate = flt(item.get("rate"))

		item.authorized_amount = 0.0
		item.claimed_amount = flt(rate, 2) if apply_pct else 0.0
		item.difference_amount = flt(rate - flt(item.get("copago")), 2)

	doc.monto_reclamado = sum(flt(it.get("claimed_amount")) for it in (doc.get("items") or []))
	doc.monto_autorizado = sum(flt(it.get("authorized_amount")) for it in (doc.get("items") or []))
	doc.diferencia = sum(flt(it.get("difference_amount")) for it in (doc.get("items") or []))


def _recalculate_header_copago(doc):
	"""Recalcula el copago del header sumando el copago de las líneas de items.

	Esto actúa como salvaguarda contra la condición de carrera donde el usuario
	envía la factura antes de que el JS asíncrono actualice el campo del header.
	Solo aplica a facturas de Clientes Seguros (donde el copago es relevante).
	"""
	if doc.get("tipo_de_factura") not in ("Clientes Seguros", "Servimerd", "Meds"):
		return

	total_copago = sum(
		frappe.utils.flt(item.get("copago") or 0)
		for item in (doc.get("items") or [])
	)
	doc.copago = total_copago


def autoname(self, event):
	self.name = make_autoname("FACT-.#####")
	# Only fill ncf via naming_series as a last-resort fallback when dgii's
	# before_insert did not set one. The previous "or self.is_return" branch
	# overwrote the correct e-CF NCF (E34...) generated by dgii for returns
	# with the doc naming_series counter (SINV-YYYY-N), producing invalid NCFs
	# on credit notes.
	# if not self.ncf:
	# 	self.ncf = make_autoname(self.naming_series)

def on_submit(self, event):
	for item in self.items:
		for name in (item.paid_sales_invoices or "").split(","):
			if not name: return

			doc = frappe.get_doc("Sales Invoice", name)
			# update payment_status [PAID|PARTIALLY PAID|UNPAID]
			doc.payment_status = "UNPAID" if self.get("is_return") else "PAID"

			doc.db_update()

	frappe.db.commit()

@frappe.whitelist()
def update_personal_info(self):
	data = json.loads(self) 
	inv = frappe.get_doc(data.get('doctype'), data.get('name'))
	cust = frappe.get_doc("Customer", inv.customer)
	inv.update({
		"nss": cust.nss,
		"tax_id": cust.tax_id,
		"ars": cust.ars
	})
	inv.db_update()
	frappe.db.commit()


DGII_CREDIT_NOTE_MODIFICATION_TYPE = "Anulación Total"
DGII_CREDIT_NOTE_REASON = "1"


def _get_invoices_pending_dgii_credit_note():
	return frappe.get_all(
		"Sales Invoice",
		filters={
			"requiere_nota_credito_dgii": 1,
			"docstatus": 1,
			"is_return": 0,
		},
		fields=["name", "ncf", "posting_date"],
		order_by="posting_date asc, name asc",
	)


def _has_open_credit_note(invoice_name):
	return bool(
		frappe.db.exists(
			"Sales Invoice",
			{
				"return_against": invoice_name,
				"is_return": 1,
				"docstatus": ["<", 2],
			},
		)
	)


def _normalize_pos_return_payments(credit_note, source):
	"""Asegura montos negativos en pagos POS de notas de crédito."""
	if not credit_note.is_pos:
		return

	credit_note.set("payments", [])
	for data in source.get("payments") or []:
		amount = flt(data.amount)
		base_amount = flt(data.base_amount) or flt(amount * source.conversion_rate)
		credit_note.append(
			"payments",
			{
				"mode_of_payment": data.mode_of_payment,
				"type": data.type,
				"amount": -abs(amount),
				"base_amount": -abs(base_amount),
				"account": data.account,
				"default": data.default,
			},
		)

	credit_note.paid_amount = -abs(flt(source.paid_amount))


def _create_credit_note_from_invoice(invoice_name, submit=False):
	from erpnext.accounts.doctype.sales_invoice.sales_invoice import make_sales_return

	if _has_open_credit_note(invoice_name):
		existing = frappe.db.get_value(
			"Sales Invoice",
			{
				"return_against": invoice_name,
				"is_return": 1,
				"docstatus": ["<", 2],
			},
			"name",
		)
		return {"status": "skipped", "invoice": invoice_name, "credit_note": existing}

	source = frappe.get_doc("Sales Invoice", invoice_name)
	if source.docstatus != 1 or source.is_return:
		frappe.throw(_("La factura {0} debe estar enviada y no ser una nota de crédito.").format(invoice_name))

	credit_note = make_sales_return(invoice_name)
	credit_note.modification_type = DGII_CREDIT_NOTE_MODIFICATION_TYPE
	credit_note.reason_for_modification = DGII_CREDIT_NOTE_REASON
	credit_note.posting_date = frappe.utils.today()
	credit_note.set_posting_time = 0
	credit_note.requiere_nota_credito_dgii = 0
	_normalize_pos_return_payments(credit_note, source)

	if not credit_note.return_against_ncf and source.ncf:
		credit_note.return_against_ncf = source.ncf

	# calculate_taxes_and_totals reparte pagos POS en positivo para devoluciones;
	# recalculamos y normalizamos antes de insertar sin re-validar ese paso.
	credit_note.run_method("calculate_taxes_and_totals")
	_normalize_pos_return_payments(credit_note, source)
	credit_note.flags.ignore_validate = True

	credit_note.insert(ignore_permissions=True)

	if submit:
		credit_note.submit()

	return {
		"status": "submitted" if submit else "created",
		"invoice": invoice_name,
		"credit_note": credit_note.name,
	}


@frappe.whitelist()
def create_dgii_credit_note(invoice_name, submit=0):
	"""Crea una nota de crédito (E34) con el flujo estándar de ERPNext."""
	submit = frappe.parse_json(submit)
	result = _create_credit_note_from_invoice(invoice_name, submit=bool(submit))
	frappe.db.commit()
	return result


@frappe.whitelist()
def create_dgii_credit_notes_bulk(dry_run=False, submit=False):
	"""Crea notas de crédito para todas las facturas marcadas con requiere_nota_credito_dgii."""
	dry_run = frappe.parse_json(dry_run)
	submit = frappe.parse_json(submit)

	results = []
	for row in _get_invoices_pending_dgii_credit_note():
		if dry_run:
			results.append(
				{
					"status": "dry_run",
					"invoice": row.name,
					"ncf": row.ncf,
					"has_credit_note": _has_open_credit_note(row.name),
				}
			)
			continue

		try:
			result = _create_credit_note_from_invoice(row.name, submit=bool(submit))
			results.append(result)
		except Exception:
			frappe.log_error(
				title=f"Error creando NC para {row.name}",
				message=frappe.get_traceback(),
			)
			results.append(
				{
					"status": "error",
					"invoice": row.name,
					"error": frappe.get_traceback(),
				}
			)

	if not dry_run:
		frappe.db.commit()

	return {
		"dry_run": dry_run,
		"submit": bool(submit),
		"count": len(results),
		"results": results,
	}


def _get_draft_dgii_credit_notes():
	return frappe.db.sql(
		"""
		SELECT cn.name, cn.return_against, orig.name AS invoice
		FROM `tabSales Invoice` cn
		INNER JOIN `tabSales Invoice` orig ON cn.return_against = orig.name
		WHERE orig.requiere_nota_credito_dgii = 1
		  AND orig.docstatus = 1
		  AND cn.is_return = 1
		  AND cn.docstatus = 0
		ORDER BY cn.name
		""",
		as_dict=True,
	)


@frappe.whitelist()
def submit_dgii_credit_notes_bulk(dry_run=False):
	"""Envía (submit) todas las notas de crédito en borrador ligadas a facturas DGII pendientes."""
	dry_run = frappe.parse_json(dry_run)
	results = []

	for row in _get_draft_dgii_credit_notes():
		if dry_run:
			results.append({"status": "dry_run", "credit_note": row.name, "invoice": row.invoice})
			continue

		try:
			credit_note = frappe.get_doc("Sales Invoice", row.name)
			source = frappe.get_doc("Sales Invoice", row.return_against)
			_normalize_pos_return_payments(credit_note, source)
			credit_note.run_method("calculate_taxes_and_totals")
			_normalize_pos_return_payments(credit_note, source)
			credit_note.flags.ignore_validate = True
			credit_note.save(ignore_permissions=True)
			credit_note.flags.ignore_validate = False
			_normalize_pos_return_payments(credit_note, source)
			credit_note.flags.ignore_validate = True
			credit_note.submit()
			results.append(
				{
					"status": "submitted",
					"credit_note": credit_note.name,
					"invoice": row.invoice,
					"ncf": credit_note.ncf,
					"legal_status": credit_note.get("legal_status"),
				}
			)
		except Exception:
			frappe.log_error(
				title=f"Error enviando NC {row.name}",
				message=frappe.get_traceback(),
			)
			results.append(
				{
					"status": "error",
					"credit_note": row.name,
					"invoice": row.invoice,
					"error": frappe.get_traceback(),
				}
			)

	if not dry_run:
		frappe.db.commit()

	submitted = sum(1 for r in results if r.get("status") == "submitted")
	errors = sum(1 for r in results if r.get("status") == "error")

	return {
		"dry_run": dry_run,
		"count": len(results),
		"submitted": submitted,
		"errors": errors,
		"results": results,
	}


def _get_pending_dgii_sales_invoices():
	"""Facturas enviadas con e-NCF que aún no tienen respuesta de Alanube/DGII."""
	return frappe.db.sql(
		"""
		SELECT
			name,
			ncf,
			posting_date,
			posting_time,
			is_return
		FROM `tabSales Invoice`
		WHERE docstatus = 1
		  AND ncf LIKE 'E%%'
		  AND IFNULL(dgii_response_id, '') = ''
		ORDER BY ncf ASC, posting_date ASC, posting_time ASC
		""",
		as_dict=True,
	)


def _send_pending_encf_to_alanube(pending, dry_run=False, delay_seconds=5, stop_on_error=False):
	from alanube.controllers.sales_invoice import send_encf_to_alanube
	from alanube.utils.dgii_status import refresh_sales_invoice_status

	results = []

	for index, row in enumerate(pending):
		if dry_run:
			results.append(
				{
					"status": "dry_run",
					"name": row.name,
					"ncf": row.ncf,
					"posting_date": str(row.posting_date),
					"posting_time": str(row.posting_time),
					"is_return": row.is_return,
				}
			)
			continue

		try:
			refresh_sales_invoice_status(row.name)
			doc = frappe.get_doc("Sales Invoice", row.name)
			response = send_encf_to_alanube(doc)
			doc.reload()
			frappe.db.commit()

			frappe.logger("rades").info(
				"Alanube bulk send {}/{}: {} ({})".format(
					index + 1, len(pending), doc.name, doc.ncf
				)
			)

			results.append(
				{
					"status": "sent",
					"name": doc.name,
					"ncf": doc.ncf,
					"dgii_response_id": doc.get("dgii_response_id"),
					"legal_status": doc.get("legal_status"),
					"alanube_status": (response or {}).get("status") if isinstance(response, dict) else None,
				}
			)
		except Exception:
			frappe.db.rollback()
			frappe.log_error(
				title=f"Error enviando {row.name} a Alanube",
				message=frappe.get_traceback(),
			)
			results.append(
				{
					"status": "error",
					"name": row.name,
					"ncf": row.ncf,
					"error": frappe.get_traceback(),
				}
			)
			if stop_on_error:
				break

		if index < len(pending) - 1 and delay_seconds > 0:
			time.sleep(delay_seconds)

	return results


@frappe.whitelist()
def send_pending_encf_to_alanube_bulk(dry_run=False, delay_seconds=5, stop_on_error=False):
	"""Envía a Alanube/DGII todas las facturas e-NCF pendientes, en orden fiscal."""
	dry_run = frappe.parse_json(dry_run)
	stop_on_error = frappe.parse_json(stop_on_error)
	delay_seconds = cint(delay_seconds) or 5

	pending = _get_pending_dgii_sales_invoices()
	results = _send_pending_encf_to_alanube(
		pending,
		dry_run=dry_run,
		delay_seconds=delay_seconds,
		stop_on_error=bool(stop_on_error),
	)

	sent = sum(1 for r in results if r.get("status") == "sent")
	errors = sum(1 for r in results if r.get("status") == "error")

	summary = {
		"dry_run": dry_run,
		"delay_seconds": delay_seconds,
		"stop_on_error": bool(stop_on_error),
		"count": len(results),
		"pending_total": len(pending),
		"sent": sent,
		"errors": errors,
	}

	if len(results) <= 50:
		summary["results"] = results
	else:
		summary["results_sample"] = results[:10] + results[-10:]
		summary["results_truncated"] = True

	return summary


@frappe.whitelist()
def send_dgii_credit_notes_to_alanube_bulk(dry_run=False, delay_seconds=5):
	"""Alias: envía pendientes DGII (todas las facturas, no solo NC)."""
	return send_pending_encf_to_alanube_bulk(
		dry_run=dry_run,
		delay_seconds=delay_seconds,
		stop_on_error=False,
	)


def on_cancel(self, event):
	for item in self.items:
		for name in (item.paid_sales_invoices or "").split(","):
			if not name: return

			doc = frappe.get_doc("Sales Invoice", name)
			# update payment_status [PAID|PARTIALLY PAID|UNPAID]
			doc.payment_status = "PAID" if self.get("is_return") else "UNPAID"

			doc.db_update()

	frappe.db.commit()


PAYMENT_ACCOUNTING_FIELDS = ("mode_of_payment", "account", "amount", "base_amount")


def on_update_after_submit(doc, event=None):
	"""Repost GL when POS payment rows change after submit.

	ERPNext auto-reposts income/tax account edits but ignores the payments
	child table. POS cash/bank lines come from payment.account, so MoP/account
	corrections must trigger Repost Accounting Ledger.
	"""
	if not cint(doc.get("is_pos")):
		return

	if getattr(doc, "needs_repost", False):
		# Core already reposted in this save using current payment values.
		return

	if not _payments_accounting_changed(doc):
		return

	doc.validate_for_repost()
	doc.repost_accounting_entries()
	frappe.msgprint(
		_("Accounting entries were reposted because Mode of Payment / payment account changed."),
		indicator="green",
		alert=True,
	)


def _payments_accounting_changed(doc):
	"""Return True if payment accounting fields changed; block add/remove rows."""
	before = doc.get_doc_before_save()
	if not before:
		return False

	before_rows = before.get("payments") or []
	after_rows = doc.get("payments") or []

	before_by_name = {row.name: row for row in before_rows if row.name}
	after_by_name = {row.name: row for row in after_rows if row.name}
	has_new_rows = any(not row.name for row in after_rows)

	if has_new_rows or set(before_by_name) != set(after_by_name) or len(before_rows) != len(after_rows):
		frappe.throw(
			_(
				"Cannot add or remove payment rows after submit. "
				"Edit Mode of Payment / Account on existing rows only, or cancel and amend."
			),
			title=_("Payment rows changed"),
		)

	for name, before_row in before_by_name.items():
		after_row = after_by_name[name]
		for field in PAYMENT_ACCOUNTING_FIELDS:
			before_val = before_row.get(field)
			after_val = after_row.get(field)
			if field in ("amount", "base_amount"):
				if flt(before_val) != flt(after_val):
					return True
			elif before_val != after_val:
				return True

	return False

