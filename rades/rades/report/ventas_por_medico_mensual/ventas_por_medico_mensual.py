# Copyright (c) 2026, TzCode and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import frappe
from frappe.utils import flt


def execute(filters=None):
	filters = filters or {}
	# Vista por defecto: detalle línea a línea (igual que Ventas por medico original)
	if filters.get("show_summary"):
		columns = get_summary_columns()
		data = get_summary_data(filters)
	else:
		columns = get_classic_columns()
		data = get_classic_data(filters)

	return columns, data


def get_classic_columns():
	"""Mismas columnas que el reporte Ventas por medico original."""
	return [
		"Factura:Link/Sales Invoice:90",
		"Fecha:Date:90",
		"Paciente:Link/Customer:200",
		"Medico:Link/Medico:180",
		"Servicio:Data:200",
		"Grupo:Link/Item Group:120",
		"Total:Currency:90",
		"Porcentaje:Percent:80",
		"Comision:Currency:100",
	]


def get_classic_data(filters):
	conditions = get_conditions(filters, table_prefix="p", item_prefix="c")

	return frappe.db.sql("""
		SELECT
			p.name AS invoice,
			p.posting_date,
			p.customer,
			p.medico,
			c.item_name,
			c.item_group,
			c.amount,
			m.referido,
			c.amount * (m.referido / 100.0) AS comision
		FROM
			`tabSales Invoice` AS p
		JOIN
			`tabSales Invoice Item` AS c ON c.parent = p.name
		JOIN
			`tabMedico` AS m ON p.medico = m.name
		WHERE
			p.docstatus = 1
			{conditions}
		ORDER BY
			p.posting_date, p.name
	""".format(conditions=conditions), filters)


# ---------------------------------------------------------------------------
# Columns
# ---------------------------------------------------------------------------

def get_summary_columns():
	return [
		{
			"label": "Médico",
			"fieldname": "medico",
			"fieldtype": "Link",
			"options": "Medico",
			"width": 180
		},
		{
			"label": "Mes",
			"fieldname": "mes",
			"fieldtype": "Data",
			"width": 110
		},
		{
			"label": "Facturas",
			"fieldname": "qty_invoices",
			"fieldtype": "Int",
			"width": 80
		},
		{
			"label": "Servicios",
			"fieldname": "qty_items",
			"fieldtype": "Int",
			"width": 80
		},
		{
			"label": "Subtotal",
			"fieldname": "net_total",
			"fieldtype": "Currency",
			"width": 120
		},
		{
			"label": "Descuentos",
			"fieldname": "discount_amount",
			"fieldtype": "Currency",
			"width": 110
		},
		{
			"label": "Total Facturado",
			"fieldname": "grand_total",
			"fieldtype": "Currency",
			"width": 130
		},
		{
			"label": "Efectivo",
			"fieldname": "pago_efectivo",
			"fieldtype": "Currency",
			"width": 110
		},
		{
			"label": "Seguro",
			"fieldname": "pago_seguro",
			"fieldtype": "Currency",
			"width": 110
		},
		{
			"label": "Otros Pagos",
			"fieldname": "pago_otros",
			"fieldtype": "Currency",
			"width": 110
		},
		{
			"label": "% Comisión",
			"fieldname": "referido_pct",
			"fieldtype": "Percent",
			"width": 90
		},
		{
			"label": "Comisión",
			"fieldname": "comision",
			"fieldtype": "Currency",
			"width": 110
		},
	]


def get_detail_columns():
	return [
		{
			"label": "Médico",
			"fieldname": "medico",
			"fieldtype": "Link",
			"options": "Medico",
			"width": 180
		},
		{
			"label": "Factura",
			"fieldname": "invoice",
			"fieldtype": "Link",
			"options": "Sales Invoice",
			"width": 130
		},
		{
			"label": "Fecha",
			"fieldname": "posting_date",
			"fieldtype": "Date",
			"width": 90
		},
		{
			"label": "Mes",
			"fieldname": "mes",
			"fieldtype": "Data",
			"width": 100
		},
		{
			"label": "Paciente",
			"fieldname": "customer",
			"fieldtype": "Link",
			"options": "Customer",
			"width": 200
		},
		{
			"label": "Tipo Factura",
			"fieldname": "tipo_de_factura",
			"fieldtype": "Data",
			"width": 130
		},
		{
			"label": "NCF",
			"fieldname": "ncf",
			"fieldtype": "Data",
			"width": 140
		},
		{
			"label": "Servicio",
			"fieldname": "item_name",
			"fieldtype": "Data",
			"width": 200
		},
		{
			"label": "Grupo",
			"fieldname": "item_group",
			"fieldtype": "Link",
			"options": "Item Group",
			"width": 120
		},
		{
			"label": "Cantidad",
			"fieldname": "qty",
			"fieldtype": "Float",
			"width": 70
		},
		{
			"label": "Precio",
			"fieldname": "rate",
			"fieldtype": "Currency",
			"width": 100
		},
		{
			"label": "Monto",
			"fieldname": "amount",
			"fieldtype": "Currency",
			"width": 110
		},
		{
			"label": "Total Factura",
			"fieldname": "grand_total",
			"fieldtype": "Currency",
			"width": 120
		},
		{
			"label": "Pago",
			"fieldname": "payment_mode",
			"fieldtype": "Data",
			"width": 130
		},
		{
			"label": "% Comisión",
			"fieldname": "referido_pct",
			"fieldtype": "Percent",
			"width": 90
		},
		{
			"label": "Comisión",
			"fieldname": "comision",
			"fieldtype": "Currency",
			"width": 110
		},
	]


# ---------------------------------------------------------------------------
# Data — Summary (grouped by médico + month)
# ---------------------------------------------------------------------------

def get_summary_data(filters):
	conditions = get_conditions(filters)

	rows = frappe.db.sql("""
		SELECT
			si.medico,
			DATE_FORMAT(si.posting_date, '%%Y-%%m') AS mes,
			COUNT(DISTINCT si.name)                 AS qty_invoices,
			COUNT(sii.name)                         AS qty_items,
			SUM(sii.net_amount)                     AS net_total,
			SUM(si.discount_amount)                 AS discount_amount,
			SUM(si.grand_total)                     AS grand_total,
			SUM(CASE WHEN sip.mode_of_payment = 'Efectivo' THEN sip.amount ELSE 0 END) AS pago_efectivo,
			SUM(CASE WHEN sip.mode_of_payment = 'Seguro'   THEN sip.amount ELSE 0 END) AS pago_seguro,
			SUM(CASE WHEN sip.mode_of_payment NOT IN ('Efectivo','Seguro') AND sip.mode_of_payment IS NOT NULL THEN sip.amount ELSE 0 END) AS pago_otros,
			COALESCE(m.referido, 0)                 AS referido_pct,
			SUM(si.grand_total) * COALESCE(m.referido, 0) / 100.0 AS comision
		FROM
			`tabSales Invoice`          si
		JOIN
			`tabSales Invoice Item`     sii  ON sii.parent = si.name
		JOIN
			`tabMedico`                 m    ON m.name = si.medico
		LEFT JOIN
			`tabSales Invoice Payment`  sip  ON sip.parent = si.name
		WHERE
			si.docstatus = 1
			{conditions}
		GROUP BY
			si.medico,
			DATE_FORMAT(si.posting_date, '%%Y-%%m'),
			m.referido
		ORDER BY
			si.medico,
			mes
	""".format(conditions=conditions), filters, as_dict=1)

	return rows


# ---------------------------------------------------------------------------
# Data — Detail (one row per invoice item)
# ---------------------------------------------------------------------------

def get_detail_data(filters):
	conditions = get_conditions(filters)

	rows = frappe.db.sql("""
		SELECT
			si.medico,
			si.name                                         AS invoice,
			si.posting_date,
			DATE_FORMAT(si.posting_date, '%%Y-%%m')        AS mes,
			si.customer,
			si.tipo_de_factura,
			si.ncf,
			sii.item_name,
			sii.item_group,
			sii.qty,
			sii.rate,
			sii.amount,
			si.grand_total,
			GROUP_CONCAT(DISTINCT sip.mode_of_payment ORDER BY sip.mode_of_payment SEPARATOR ' / ') AS payment_mode,
			COALESCE(m.referido, 0)                        AS referido_pct,
			sii.amount * COALESCE(m.referido, 0) / 100.0  AS comision
		FROM
			`tabSales Invoice`          si
		JOIN
			`tabSales Invoice Item`     sii  ON sii.parent = si.name
		JOIN
			`tabMedico`                 m    ON m.name = si.medico
		LEFT JOIN
			`tabSales Invoice Payment`  sip  ON sip.parent = si.name
		WHERE
			si.docstatus = 1
			{conditions}
		GROUP BY
			sii.name,
			si.medico,
			si.name,
			si.posting_date,
			si.customer,
			si.tipo_de_factura,
			si.ncf,
			sii.item_name,
			sii.item_group,
			sii.qty,
			sii.rate,
			sii.amount,
			si.grand_total,
			m.referido
		ORDER BY
			si.medico,
			si.posting_date,
			si.name
	""".format(conditions=conditions), filters, as_dict=1)

	return rows


# ---------------------------------------------------------------------------
# Filter builder
# ---------------------------------------------------------------------------

def get_conditions(filters, table_prefix="si", item_prefix="sii"):
	parts = []

	if filters.get("from_date"):
		parts.append(f"AND {table_prefix}.posting_date >= %(from_date)s")

	if filters.get("to_date"):
		parts.append(f"AND {table_prefix}.posting_date <= %(to_date)s")

	if filters.get("medico"):
		parts.append(f"AND {table_prefix}.medico = %(medico)s")

	if filters.get("item_group"):
		parts.append(f"AND {item_prefix}.item_group = %(item_group)s")

	if filters.get("tipo_de_factura"):
		parts.append(f"AND {table_prefix}.tipo_de_factura = %(tipo_de_factura)s")

	return " ".join(parts)
