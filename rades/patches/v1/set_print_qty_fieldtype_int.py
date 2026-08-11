import frappe


def execute():
	"""print_qty (Cantidad Real ARS) debe ser entero: cuenta consultas sin afectar monto."""
	# Vacíos en varchar impiden el ALTER a INT; normalizar antes del cambio.
	frappe.db.sql(
		"""
		UPDATE `tabSales Invoice Item`
		SET print_qty = 0
		WHERE print_qty IS NULL OR IFNULL(print_qty, '') = ''
		"""
	)

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
	frappe.clear_cache(doctype="Sales Invoice Item")
	frappe.db.updatedb("Sales Invoice Item")
