// Copyright (c) 2026, TzCode and contributors
// For license information, please see license.txt

frappe.query_reports["Ventas por Medico Mensual"] = {
	"filters": [
		{
			"label": __("From Date"),
			"fieldtype": "Date",
			"fieldname": "from_date",
			"default": frappe.datetime.month_start(),
			"reqd": 1
		},
		{
			"label": __("To Date"),
			"fieldtype": "Date",
			"fieldname": "to_date",
			"default": frappe.datetime.now_date(),
			"reqd": 1
		},
		{
			"label": __("Medico"),
			"fieldtype": "Link",
			"fieldname": "medico",
			"options": "Medico",
			"reqd": 1
		},
		{
			"label": __("Group"),
			"fieldtype": "Select",
			"fieldname": "item_group",
			"options": "\nMamografias\nRadiografias\nSonografias\nContrastes\nDesintometrias"
		},
		{
			"label": __("Resumen por Mes"),
			"fieldtype": "Check",
			"fieldname": "show_summary",
			"default": 0
		}
	]
};
