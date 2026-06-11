// Copyright (c) 2026, Lewin Villar and contributors
// For license information, please see license.txt

frappe.query_reports["Registro de Ventas"] = {
	filters: [
		{
			fieldname: "from_date",
			label: __("From Date"),
			fieldtype: "Date",
			default: frappe.datetime.month_start(),
			reqd: 1,
		},
		{
			fieldname: "to_date",
			label: __("To Date"),
			fieldtype: "Date",
			default: frappe.datetime.now_date(),
			reqd: 1,
		},
		{
			fieldname: "tipo_de_factura",
			label: __("Tipo de Factura"),
			fieldtype: "Select",
			options: [
				"",
				"Clientes Privados",
				"Clientes Seguros",
				"Alquiler",
				"Proveedores",
			],
			default: "",
		},
	],
};
