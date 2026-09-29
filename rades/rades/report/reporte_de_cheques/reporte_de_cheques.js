// Copyright (c) 2026, Lewin Villar and contributors
// For license information, please see license.txt

frappe.query_reports["REPORTE DE CHEQUES"] = {
	filters: [
		{
			fieldname: "from_date",
			label: __("Desde"),
			fieldtype: "Date",
			default: frappe.datetime.month_start(),
			reqd: 1,
		},
		{
			fieldname: "to_date",
			label: __("Hasta"),
			fieldtype: "Date",
			default: frappe.datetime.month_end(),
			reqd: 1,
		},
		{
			fieldname: "voucher_type",
			label: __("Tipo de Asiento"),
			fieldtype: "Select",
			options: [
				"",
				"Journal Entry",
				"Bank Entry",
				"Deposito",
				"Cheque",
				"Cash Entry",
				"Credit Card Entry",
				"Debit Note",
				"Credit Note",
				"Contra Entry",
				"Excise Entry",
				"Write Off Entry",
				"Opening Entry",
				"Depreciation Entry",
				"Exchange Gain Or Loss",
				"Asset Disposal",
			],
			default: "Cheque",
		},
	],
};
