# Copyright (c) 2013, Lewin Villar and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import frappe


def execute(filters=None):
	return get_columns(filters), get_data(filters)


def get_columns(filters):
	if filters.get("summary"):
		return [
			"Grupo de Productos:Link/Item Group:200",
			"Cantidad:Int:120",
			"Reclamado:Currency:150",
			"Autorizado:Currency:150",
			"Cobertura:Currency:150",
			"Diferencia:Currency:150"
		]

	return [
		"Documento:Link/Sales Invoice:100",
		"Cliente:Data:200",
		"Fecha:Date:90",
		"Grupo de Productos:Data:200",
		"Reclamado:Currency:120",
		"Autorizado:Currency:120",
		"Cobertura:Currency:120",
		"Diferencia:Currency:120",
	]


def get_data(filters):
	  
	if filters.get("summary"):
		return get_summary_data(filters)
	else: 
		return get_detail_data(filters)



def get_summary_data(filters):
	query = frappe.db.sql("""
		Select
			sales_invoice_item.item_group,
			Count(1) as qty,
			Sum(sales_invoice_item.claimed_amount) As claimed_amount,
			Sum(sales_invoice_item.authorized_amount) As authorized_amount,
			Sum(sales_invoice_item.cobertura) As cobertura,
			Sum(sales_invoice_item.difference_amount) As difference_amount
		From
			`tabSales Invoice` As sales_invoice
		Join
			`tabSales Invoice Item` As sales_invoice_item
		On
			sales_invoice.name = sales_invoice_item.parent
		Where
			%(filters)s
		Group By
			sales_invoice_item.item_group
	""" % { "filters": get_filters(filters) }, filters)

	return query


def get_detail_data(filters):
	query = frappe.db.sql("""
		Select
			sales_invoice.name,
			sales_invoice.customer,
			sales_invoice.posting_date,
			sales_invoice_item.item_group,
			sales_invoice_item.claimed_amount,
			sales_invoice_item.authorized_amount,
			sales_invoice_item.cobertura,
			sales_invoice_item.difference_amount
		From
			`tabSales Invoice` As sales_invoice
		Join
			`tabSales Invoice Item` As sales_invoice_item
		On
			sales_invoice.name = sales_invoice_item.parent
		Where
			%(filters)s
	""" % { "filters": get_filters(filters) }, filters)

	return query


def get_filters(filters):
	query = ['sales_invoice.docstatus = 1']

	if filters.get("from_date") and filters.get("to_date"):
		query.append(
			'sales_invoice.posting_date Between %(from_date)s And %(to_date)s'
		)

	if filters.get("item_group"):
		query.append('sales_invoice_item.item_group = %(item_group)s')

	return " And ".join(query)
