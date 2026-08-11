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
			on_change() {
				const tipo = frappe.query_report.get_filter_value("tipo_de_factura");
				const ars = frappe.query_report.get_filter("ars");
				if (tipo === "Clientes Seguros") {
					ars.toggle(true);
				} else {
					ars.set_value("");
					ars.toggle(false);
				}
				frappe.query_report.refresh();
			},
		},
		{
			fieldname: "ars",
			label: __("ARS"),
			fieldtype: "Link",
			options: "Customer",
			hidden: 1,
			get_query: () => {
				return {
					"filters": {
						"customer_group": "Proveedores"
					}
				};
			},
		},
	],
};
