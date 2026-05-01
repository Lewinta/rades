import frappe
from frappe.utils import flt


def _unwrap_in_filter(value):
	"""Accept either a plain value or an ``["in", value]`` pair from a link query."""
	if isinstance(value, (list, tuple)) and len(value) == 2 and str(value[0]).lower() == "in":
		return value[1]
	return value


@frappe.whitelist()
@frappe.validate_and_sanitize_search_inputs
def customer_query(doctype, txt, searchfield, start, page_len, filters):
	like = "%{}%".format("%".join(txt.split())) if txt else "%"
	customer_group = _unwrap_in_filter(filters.get("customer_group")) or "Clientes"

	return frappe.get_list(
		"Customer",
		filters={
			"name": ["like", like],
			"customer_group": customer_group,
		},
		fields=["name", "customer_group"],
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
