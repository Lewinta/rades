import frappe
from frappe.utils import flt


def _unwrap_in_filter(value):
	"""Accept either a plain value or an ``["in", value]`` pair from a link query."""
	if isinstance(value, (list, tuple)) and len(value) == 2 and str(value[0]).lower() == "in":
		return value[1]
	return value


def _invoices_with_credit_note():
	"""Facturas que ya tienen una nota de crédito enviada aplicada contra ellas.

	Solo se consideran las notas de crédito enviadas (docstatus=1): un borrador
	todavía puede descartarse, y excluir por él dejaría fuera facturas válidas.
	"""
	names = frappe.get_all(
		"Sales Invoice",
		filters={
			"is_return": 1,
			"docstatus": 1,
			"return_against": ["is", "set"],
		},
		pluck="return_against",
	)
	return list({name for name in names if name})


@frappe.whitelist()
@frappe.validate_and_sanitize_search_inputs
def cargar_facturas_query(doctype, txt, searchfield, start, page_len, filters):
	"""Search Sales Invoices for the Cargar Facturas dialog."""
	if isinstance(filters, str):
		filters = frappe.parse_json(filters)
	filters = filters or {}

	query_filters = {}
	for fieldname in ("customer_group", "ars", "tipo_de_factura", "status"):
		value = filters.get(fieldname)
		if value:
			query_filters[fieldname] = value

	# MultiSelectDialog performs its first search while Link defaults are still
	# being initialized. These context values keep that first request consistent
	# with the values already displayed in the controls.
	if not query_filters.get("ars") and filters.get("supplier_ars"):
		query_filters["ars"] = filters.get("supplier_ars")
	if not query_filters.get("tipo_de_factura") and filters.get("allowed_tipo_de_factura"):
		query_filters["tipo_de_factura"] = ["in", filters.get("allowed_tipo_de_factura")]
	if not query_filters.get("status"):
		query_filters["status"] = filters.get("default_status") or "Paid"

	# Notas de crédito: nunca deben poder cargarse. La nota de crédito en sí es
	# un monto negativo que no corresponde reclamar, y la factura original ya
	# fue anulada por ella, así que cargar cualquiera de las dos duplica montos
	# en la factura de proveedor.
	query_filters["is_return"] = 0

	invoices_with_credit_note = _invoices_with_credit_note()
	if invoices_with_credit_note:
		query_filters["name"] = ["not in", invoices_with_credit_note]

	date_range = filters.get("posting_date_range")
	if isinstance(date_range, (list, tuple)) and len(date_range) == 2:
		from_date, to_date = date_range
		if from_date and to_date:
			query_filters["posting_date"] = ["between", [from_date, to_date]]
		elif from_date:
			query_filters["posting_date"] = [">=", from_date]
		elif to_date:
			query_filters["posting_date"] = ["<=", to_date]

	search = "%{}%".format(txt)
	return frappe.get_list(
		"Sales Invoice",
		filters=query_filters,
		or_filters={
			"name": ["like", search],
			"ars": ["like", search],
		} if txt else None,
		fields=["name", "posting_date", "ars", "tipo_de_factura", "status"],
		order_by="posting_date desc, name desc",
		start=start,
		page_length=page_len,
	)


@frappe.whitelist()
@frappe.validate_and_sanitize_search_inputs
def customer_query(doctype, txt, searchfield, start, page_len, filters):
	like = "%{}%".format("%".join(txt.split())) if txt else "%"
	customer_group = _unwrap_in_filter(filters.get("customer_group")) or "Clientes"

	# Allow searching the customer by any of these fields (whichever exist on this
	# site): docname, customer name, RNC/Cedula (tax_id), NSS and phone (telefono).
	meta = frappe.get_meta("Customer")
	search_fields = ["name", "customer_name"]
	for fieldname in ("tax_id", "nss", "telefono"):
		if meta.has_field(fieldname):
			search_fields.append(fieldname)

	return frappe.get_list(
		"Customer",
		filters={"customer_group": customer_group},
		or_filters=[[fieldname, "like", like] for fieldname in search_fields],
		fields=["name", "customer_name","tax_id", "nss", "telefono"],
		order_by="name",
		distinct=True,
		start=start,
		page_length=page_len,
		as_list=True,
	)


@frappe.whitelist()
@frappe.validate_and_sanitize_search_inputs
def customer_ars_query(doctype, txt, searchfield, start, page_len, filters):
	like = "%{}%".format("%".join(txt.split())) if txt else "%"
	customer_group = _unwrap_in_filter(filters.get("customer_group"))

	rows = frappe.get_list(
		"Sales Invoice",
		filters={
			"ars": ["like", like],
			"customer_group": customer_group,
		},
		fields=["ars"],
		order_by="ars",
		distinct=True,
		start=start,
		page_length=page_len,
	)
	return [[row.ars, "Proveedores"] for row in rows]


@frappe.whitelist()
@frappe.validate_and_sanitize_search_inputs
def item_by_ars(doctype, txt, searchfield, start, page_len, filters):
	ars = filters.get("ars")

	if not ars:
		return frappe.get_list(
			"Item",
			filters={"item_code": ["not in", ["Consultas", "ALQUILER"]]},
			fields=["item_code"],
			as_list=True,
		)

	result = frappe.db.sql(
		"""
		SELECT
			item_code      AS item,
			price_list     AS ars,
			currency,
			price_list_rate AS price
		FROM `tabItem Price`
		WHERE price_list = %(ars)s
		  AND item_code LIKE %(txt)s
		ORDER BY item_code
		LIMIT 20
		""",
		{"ars": ars, "txt": "%{}%".format("%".join(txt.split()))},
		as_dict=True,
	)

	return [
		[row.item, "{1} $ {0}".format(flt(row.price, 2), row.currency), row.ars]
		for row in result
	]
