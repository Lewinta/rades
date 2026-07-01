import frappe

FIELDS = ["claimed_amount", "authorized_amount", "difference_amount"]


def execute():
	"""Fija precision=2 en los montos aux de Sales Invoice Item.

	Estos campos son Float sin precision, y el site tiene float_precision=4, por
	lo que authorized_amount = base*cobertura guardaba 3-4 decimales y generaba
	drift al agregar al Proveedor (que trabaja a 2 decimales). Idempotente:
	make_property_setter reemplaza el Property Setter si ya existe.
	"""
	for fieldname in FIELDS:
		frappe.make_property_setter(
			{
				"doctype": "Sales Invoice Item",
				"fieldname": fieldname,
				"property": "precision",
				"value": "2",
				"property_type": "Select",
			},
			is_system_generated=False,
		)
	frappe.clear_cache(doctype="Sales Invoice Item")
