import frappe
from frappe.utils import flt

# Bloque inicial a corregir (facturas con >2 decimales detectadas en el analisis).
BLOCK_INVOICES = [
	"FACT-93014", "FACT-93038", "FACT-93108",
	"FACT-93129", "FACT-93184", "FACT-93364",
]

ITEM_FIELDS = ["claimed_amount", "authorized_amount", "difference_amount"]
HEADER_FIELDS = ["monto_reclamado", "monto_autorizado", "diferencia"]


def _dirty(v):
	return round(flt(v), 2) != flt(v)


def find_dirty(invoice_names=None):
	"""Devuelve los SI (de la lista dada o BLOCK_INVOICES) con item/header a >2 dec."""
	names = invoice_names or BLOCK_INVOICES
	dirty = []
	for name in names:
		hdr = frappe.db.get_value("Sales Invoice", name, HEADER_FIELDS, as_dict=True)
		if hdr and any(_dirty(hdr.get(f)) for f in HEADER_FIELDS):
			dirty.append(name)
			continue
		items = frappe.get_all("Sales Invoice Item", filters={"parent": name}, fields=["name"] + ITEM_FIELDS)
		if any(_dirty(it.get(f)) for it in items for f in ITEM_FIELDS):
			dirty.append(name)
	return dirty


def run(invoice_names=None, dry_run=True):
	"""Redondea a 2 decimales los montos aux de items y header.

	Solo campos auxiliares via db.set_value(update_modified=False): NO toca
	rate/amount/grand_total/GL y NO re-somete. Idempotente.
	"""
	names = invoice_names or BLOCK_INVOICES
	changed = []
	for name in names:
		items = frappe.get_all(
			"Sales Invoice Item", filters={"parent": name},
			fields=["name"] + ITEM_FIELDS)
		for it in items:
			updates = {f: flt(it.get(f), 2) for f in ITEM_FIELDS if _dirty(it.get(f))}
			if updates:
				changed.append(("item", it.name, updates))
				if not dry_run:
					frappe.db.set_value("Sales Invoice Item", it.name, updates, update_modified=False)

		hdr = frappe.db.get_value("Sales Invoice", name, HEADER_FIELDS, as_dict=True) or {}
		hupd = {f: flt(hdr.get(f), 2) for f in HEADER_FIELDS if _dirty(hdr.get(f))}
		if hupd:
			changed.append(("header", name, hupd))
			if not dry_run:
				frappe.db.set_value("Sales Invoice", name, hupd, update_modified=False)

	if not dry_run:
		frappe.db.commit()

	print("DRY_RUN" if dry_run else "APPLIED", "-> cambios:", len(changed))
	for kind, ref, upd in changed:
		print("  ", kind, ref, upd)
	return {"dry_run": dry_run, "changes": len(changed)}
