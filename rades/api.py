import frappe

import json
from frappe.defaults import get_global_default

@frappe.whitelist()
def update_sales_invoice(doc, selections, args):
	json_object = json.loads(doc)

	sinv = frappe.get_doc(json_object)

	# clear the items table
	sinv.set("items", [])

	total = 0.000

	invoices_qty = len(selections.split(","))

	amount_based_on = frappe.get_value("Customer", sinv.customer, "amount_based_on")


	if amount_based_on == "Authorized Amount":
		fieldname = "monto_autorizado"
	elif amount_based_on == "Difference Amount":
		fieldname = "diferencia"
	else:
		frappe.throw("Amount Base On is not any of the options: [Difference Amount, Authorized Amount]")

	for name in selections.split(","):
		total += frappe.get_value("Sales Invoice", name, fieldname) or 0.000

	if not frappe.get_value("Item", "Consultas"):
		create_service_item()

	sinv.append("items", {
		"item_code": "Consultas",
		"item_name": "Consultas",
		"description": "Consultas",
		"item_group": "Servicios",
		# stock_uom/uom intentionally omitted: set_missing_values() pulls them
		# from the Item record, which keeps this portable across sites where
		# the UOM name differs (csrd uses "Unidad" after the Unidad(es) merge).
		"paid_sales_invoices": selections,
		"print_qty": len(selections.split(",")),
		"qty": -1 if sinv.get("is_return") else 1,
		"print_qty": invoices_qty,
		"rate": total,
		"authorized_amount": total,
		"amount": total,
		"cobertura": 100
	})

	sinv.set_missing_values()

	# When the cashier loads supplier invoices via "Cargar Facturas" the rate
	# is the accumulated total from the source invoices. set_missing_values
	# pulls price_list_rate from the Item Price for "Consultas", so any
	# difference between that catalog price and the accumulated total shows
	# up as a phantom discount. Pin the price-list rate to the loaded rate
	# (in both transaction and company currencies) so no discount is booked.
	conv = sinv.conversion_rate or 1
	plc_conv = sinv.plc_conversion_rate or conv
	for item in sinv.items:
		if item.item_code != "Consultas":
			continue
		item.price_list_rate = item.rate
		item.base_price_list_rate = (item.rate or 0) * plc_conv
		item.base_rate = (item.rate or 0) * conv
		item.discount_percentage = 0
		item.discount_amount = 0
		item.base_discount_amount = 0

	return sinv.as_dict()

def create_service_item():
	default_company = get_global_default("company")
	default_income_account = frappe.get_value(
		"Company",
		default_company,
		"default_income_account"
	)
	item = frappe.new_doc("Item")

	item.update({
		"item_code": "Consultas",
		"item_name": "Consultas",
		"description": "Consultas",
		"income_account": default_income_account,
		"item_group": "Servicios"
	})

	item.insert()
