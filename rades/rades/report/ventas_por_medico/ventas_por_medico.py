# Copyright (c) 2013, Lewin Villar and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import frappe

from frappe.utils import flt

def execute(filters=None):
	return get_columns(), get_data(filters)

def get_columns():
	return [
		"Factura:Link/Sales Invoice:90",
		"Fecha:Date:90",
		"Paciente:Link/Customer:200",
		"Medico:Link/Customer:180",
		"Servicio:Link/Item Group:90",
		"Grupo:Data:90",
		"Total:Currency:90",
		"Porcentaje:Percent:80",
		"Comision:Currency:100",
	]

def get_data(filters):
	
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
			c.amount * (m.referido/100.00) AS comision
		FROM 
			`tabSales Invoice` AS p
		JOIN
			`tabSales Invoice Item` AS c
		ON
			p.name = c.parent
		JOIN
			`tabMedico` AS m 
		ON
			p.medico = m.name
		WHERE
			%(filters)s
		ORDER BY
			p.posting_date
	""" % { "filters": get_filters(filters) }, filters) 

def get_filters(filters):
	query = ['p.docstatus = 1']

	if filters.get('from_date'):
		query.append('p.posting_date >= %(from_date)s')

	if filters.get('to_date'):
		query.append('p.posting_date <= %(to_date)s')
	
	if filters.get('medico'):
		query.append('p.medico = %(medico)s')

	if filters.get('item_group'):
		query.append('c.item_group = %(item_group)s')

	return " AND ".join(query)
