import frappe

from rades.sales_invoice import fix_draft_seguro_selling_price_list


def execute():
	result = fix_draft_seguro_selling_price_list(dry_run=False)
	if result["count"]:
		frappe.logger().info(
			"Fixed selling_price_list on {count} draft Clientes Seguros invoices: {names}".format(
				count=result["count"],
				names=", ".join(row["name"] for row in result["invoices"]),
			)
		)
