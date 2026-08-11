"""Sincroniza la columna print_qty a INT (sin bench migrate).

Uso manual, solo cuando el usuario lo apruebe:
  bench --site <site> execute rades.maintenance.fix_print_qty_int_column.run

Afecta SOLO el doctype Sales Invoice Item y el campo print_qty.
"""

import frappe


def run():
	"""Normaliza datos vacíos y corre updatedb solo para Sales Invoice Item."""
	column = frappe.db.sql(
		"SHOW COLUMNS FROM `tabSales Invoice Item` LIKE %s",
		("print_qty",),
		as_dict=True,
	)
	if column and column[0].get("Type", "").startswith("int"):
		print("print_qty ya es INT, nada que hacer.")
		return

	if not frappe.db.exists("Property Setter", "Sales Invoice Item-print_qty-fieldtype"):
		frappe.make_property_setter(
			{
				"doctype": "Sales Invoice Item",
				"fieldname": "print_qty",
				"property": "fieldtype",
				"value": "Int",
				"property_type": "Select",
			},
			is_system_generated=False,
		)

	frappe.db.sql(
		"""
		UPDATE `tabSales Invoice Item`
		SET print_qty = 0
		WHERE print_qty IS NULL OR IFNULL(print_qty, '') = ''
		"""
	)
	frappe.clear_cache(doctype="Sales Invoice Item")
	frappe.db.updatedb("Sales Invoice Item")
	print("Listo: print_qty sincronizado a INT en Sales Invoice Item.")
