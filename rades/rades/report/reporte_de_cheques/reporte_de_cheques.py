# Copyright (c) 2026, Lewin Villar and contributors
# For license information, please see license.txt

import frappe
from frappe import _


def execute(filters=None):
	filters = frappe._dict(filters or {})
	if filters.from_date and filters.to_date and filters.from_date > filters.to_date:
		frappe.throw(_("La fecha Desde no puede ser mayor que la fecha Hasta"))

	return get_columns(), get_data(filters)


def get_columns():
	return [
		{"label": _("Documento"), "fieldname": "name", "fieldtype": "Link", "options": "Journal Entry", "width": 120},
		{"label": _("Pagar A / Recibido De"), "fieldname": "pay_to_recd_from", "fieldtype": "Data", "width": 300},
		{"label": _("Fecha"), "fieldname": "posting_date", "fieldtype": "Date", "width": 110},
		{"label": _("Beneficiario"), "fieldname": "recipient", "fieldtype": "Link", "options": "Supplier", "width": 300},
		{"label": _("No. Cheque"), "fieldname": "cheque_no", "fieldtype": "Data", "width": 140},
		{"label": _("Monto"), "fieldname": "total_debit", "fieldtype": "Currency", "width": 160},
		{"label": _("Comentario"), "fieldname": "user_remark", "fieldtype": "Data", "width": 400},
		{"label": _("Tipo de Asiento"), "fieldname": "voucher_type", "fieldtype": "Data", "width": 150},
	]


def get_data(filters):
	return frappe.db.sql(
		"""
		SELECT
			name, pay_to_recd_from, posting_date, recipient,
			cheque_no, total_debit, user_remark, voucher_type
		FROM `tabJournal Entry`
		WHERE docstatus = 1
			AND posting_date BETWEEN %(from_date)s AND %(to_date)s
			{conditions}
		ORDER BY creation DESC
		""".format(conditions=get_conditions(filters)),
		filters,
		as_dict=True,
	)


def get_conditions(filters):
	conditions = []
	if filters.voucher_type:
		conditions.append("AND voucher_type = %(voucher_type)s")

	return " ".join(conditions)
