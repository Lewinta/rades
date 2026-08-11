"""Reubica print_qty junto a Diferencia y limita visibilidad a Proveedores.

Uso manual (NO es migrate):
  bench --site <site> execute rades.maintenance.set_print_qty_layout.run
"""

import frappe


def run():
	name = frappe.db.get_value(
		"Custom Field",
		{"dt": "Sales Invoice Item", "fieldname": "print_qty"},
	)
	if not name:
		frappe.throw("No existe el Custom Field print_qty en Sales Invoice Item")

	frappe.db.set_value(
		"Custom Field",
		name,
		{
			"insert_after": "difference_amount",
			"depends_on": "eval:parent.tipo_de_factura=='Proveedores'",
			"hidden": 0,
			"in_list_view": 0,
		},
		update_modified=False,
	)

	frappe.clear_cache(doctype="Sales Invoice Item")
	print("Listo: print_qty queda despues de Diferencia y solo en Proveedores.")
