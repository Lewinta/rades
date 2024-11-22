// Copyright (c) 2016, Lewin Villar and contributors
// For license information, please see license.txt
/* eslint-disable */

frappe.query_reports["Ingresos Promedio"] = {
	"filters": [
		{
			"fieldname":"from_date",
			"label": __("Desde"),
			"fieldtype": "Date",
			"default": frappe.datetime.month_start(),
			"reqd": 1
		},
		{
			"fieldname":"to_date",
			"label": __("Hasta"),
			"fieldtype": "Date",
			"default": frappe.datetime.month_end(),
			"reqd": 1
		},
		{
			"fieldname":"item_group",
			"label": __("Grupo de Artículos"),
			"fieldtype": "Link",
			"options": "Item Group",
			"get_query": function() {
				return {
					"filters": {
						"is_group": 0
					}
				}
			}
		},
		{
			"fieldname": "summary",
			"label": __("Resumen"),
			"fieldtype": "Check",
			"default": 1
		}

	]
}
