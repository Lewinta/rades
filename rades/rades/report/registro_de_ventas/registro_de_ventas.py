# Copyright (c) 2026, Lewin Villar and contributors
# For license information, please see license.txt

import frappe
from frappe import _


def execute(filters: dict | None = None):
	filters = frappe._dict(filters or {})
	return get_columns(), get_data(filters)


def get_columns() -> list[dict]:
	return [
		{"label": _("Fecha"),      "fieldname": "fecha",      "fieldtype": "Date",     "width": 110},
		{"label": _("ARS"),        "fieldname": "ars",        "fieldtype": "Data",     "width": 170},
		{"label": _("Paciente"),   "fieldname": "paciente",   "fieldtype": "Data",     "width": 240},
		{"label": _("Documento"),  "fieldname": "documento",  "fieldtype": "Link",     "options": "Sales Invoice", "width": 200},
		{"label": _("Total"),      "fieldname": "total",      "fieldtype": "Currency", "width": 130},
		{"label": _("Autorizado"), "fieldname": "autorizado", "fieldtype": "Currency", "width": 140},
		{"label": _("Diferencia"), "fieldname": "diferencia", "fieldtype": "Currency", "width": 140},
		{"label": _("Co-pago"),    "fieldname": "copago",     "fieldtype": "Currency", "width": 130},
	]


def get_data(filters: frappe._dict) -> list[dict]:
	si = frappe.qb.DocType("Sales Invoice")

	query = (
		frappe.qb.from_(si)
		.select(
			si.posting_date.as_("fecha"),
			si.ars.as_("ars"),
			si.customer_name.as_("paciente"),
			si.name.as_("documento"),
			si.grand_total.as_("total"),
			si.monto_autorizado.as_("autorizado"),
			si.diferencia.as_("diferencia"),
			si.copago.as_("copago"),
		)
		.where(si.docstatus < 2)
		.where(si.posting_date.between(filters.from_date, filters.to_date))
		.orderby(si.posting_date, order=frappe.qb.desc)
		.orderby(si.name, order=frappe.qb.desc)
	)

	if filters.get("tipo_de_factura"):
		query = query.where(si.tipo_de_factura == filters.tipo_de_factura)

	return query.run(as_dict=True)
