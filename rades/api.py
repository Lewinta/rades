import frappe

import json

@frappe.whitelist()
def update_sales_invoice(doc, selections, args):
	json_object = json.loads(doc)

	sinv = frappe.get_doc(json_object)

	# clear the items table
	sinv.set("items", [])
	
	total = 0.000

	invoices_qty = len(selections.split(","))
	
	for name in selections.split(","):
		total += frappe.get_value("Sales Invoice", name, "monto_autorizado") or 0.000

	if not frappe.get_value("Item", "Consultas"):
		create_service_item()

	sinv.append("items", {
		"item_code": "Consultas",
		"item_name": "Consultas",
		"description": "Consultas",
		"item_group": "Servicios",
		"stock_uom": "Unidad(es)",
		"uom": "Unidad(es)",
		"paid_sales_invoices": selections,
		"print_qty": len(selections.split(",")),
		"qty": 1,
		"print_qty": invoices_qty,
		"rate": total,
		"authorized_amount": total,
		"amount": total,
		"cobertura": 100
	})

	sinv.set_missing_values()

	return sinv.as_dict()

def create_service_item():
	item = frappe.new_doc("Item")

	item.update({
		"item_code": "Consultas",
		"item_name": "Consultas",
		"description": "Consultas",
		"item_group": "Servicios"
	})

	item.insert()