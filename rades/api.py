import frappe

import json
from frappe.defaults import get_global_default

# El campo item_type es requerido en Sales Invoice Item y NO tiene fetch_from,
# por lo que set_missing_values() no lo copia del Item master (la línea tomaría
# el default "Bien"). Además las opciones difieren entre ambos doctypes:
#   Item master:        "Bienes" / "Servicios"  (plural)
#   Sales Invoice Item: "Bien"   / "Servicio"   (singular, lo que espera la
#                                                e-CF DGII vía alanube ItemType)
ITEM_TYPE_MASTER_TO_LINE = {
	"Bienes": "Bien",
	"Servicios": "Servicio",
}


def map_item_type_to_line(master_item_type):
	"""Mapea el item_type del Item master (plural) al del Sales Invoice Item
	(singular). Devuelve "Bien" como fallback válido para el campo requerido
	cuando el valor del master está ausente o no es reconocido."""
	return ITEM_TYPE_MASTER_TO_LINE.get(master_item_type, "Bien")

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

	# item_type es requerido en la línea y no se hereda solo del master; lo
	# traemos explícitamente y lo mapeamos plural -> singular.
	consultas_item_type = map_item_type_to_line(
		frappe.get_value("Item", "Consultas", "item_type")
	)

	sinv.append("items", {
		"item_code": "Consultas",
		"item_name": "Consultas",
		"description": "Consultas",
		"item_group": "Servicios",
		"item_type": consultas_item_type,
		# stock_uom/uom intentionally omitted: set_missing_values() pulls them
		# from the Item record, which keeps this portable across sites where
		# the UOM name differs (csrd uses "Unidad" after the Unidad(es) merge).
		"paid_sales_invoices": selections,
		"print_qty": len(selections.split(",")),
		"qty": -1 if sinv.get("is_return") else 1,
		"print_qty": invoices_qty,
		"rate": total,
		# Facturas de Proveedores: el monto autorizado siempre es 0 y todo el
		# total acumulado va a la diferencia (regla reforzada server-side en
		# sales_invoice._recalculate_outside_amounts).
		"authorized_amount": 0,
		"difference_amount": total,
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
		"item_group": "Servicios",
		# item_type es requerido en el Item master; Consultas es un servicio.
		"item_type": "Servicios"
	})

	item.insert()
