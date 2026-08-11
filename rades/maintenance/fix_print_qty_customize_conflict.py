"""Quita el conflicto que bloquea Customize Form en Sales Invoice Item.

El property setter fieldtype=Int sobre print_qty deja el meta en Int pero el
Custom Field sigue en Data y la columna en varchar. Al guardar Customize Form
Frappe valida Int->Int y falla (Int no esta en ALLOWED_FIELDTYPE_CHANGE).

Uso:
  bench --site <site> execute rades.maintenance.fix_print_qty_customize_conflict.run
"""

import frappe


def run():
	setter = "Sales Invoice Item-print_qty-fieldtype"
	if frappe.db.exists("Property Setter", setter):
		frappe.delete_doc("Property Setter", setter, force=1)
		print(f"Eliminado Property Setter: {setter}")

	# Alinear con la columna real de la BD (varchar).
	frappe.db.set_value(
		"Custom Field",
		{"dt": "Sales Invoice Item", "fieldname": "print_qty"},
		"fieldtype",
		"Data",
		update_modified=False,
	)

	frappe.clear_cache(doctype="Sales Invoice Item")
	print("Listo: print_qty queda como Data; Customize Form deberia guardar sin error.")
