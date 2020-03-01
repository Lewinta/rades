// Copyright (c) 2016, Lewin Villar and contributors
// For license information, please see license.txt
/* eslint-disable */

frappe.query_reports["Ventas por medico"] = {
	"filters": [
		{
			"label": __("From Date"),
			"fieldtype": "Date",
			"fieldname": "from_date",
			"default":frappe.datetime.month_start()
		},
		{
			"label": __("To Date"),
			"fieldtype": "Date",
			"fieldname": "to_date",
			"default":frappe.datetime.now_date()
		},
		{
			"label": __("Medico"),
			"fieldtype": "Link",
			"fieldname": "medico",
			"options":"Medico",
			"reqd": 1
		},
		{
			"label": __("Group"),
			"fieldtype": "Select",
			"fieldname": "item_group",
			"options":"\nMamografias\nRadiografias\nSonografias\nContrastes\nDesintometrias"
		}
	]
}
