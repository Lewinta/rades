import frappe
from frappe import _
from frappe.model.rename_doc import rename_doc


def _rename_to_customer_name(old_name, new_name):
	if frappe.flags.in_import or frappe.flags.in_patch:
		return

	new_name = (new_name or "").strip()
	if not new_name or new_name == old_name:
		return

	if not frappe.db.exists("Customer", old_name):
		return

	current_name = frappe.db.get_value("Customer", old_name, "customer_name")
	if (current_name or "").strip() != new_name:
		return

	if frappe.db.exists("Customer", new_name):
		frappe.throw(_("Ya existe un cliente con el nombre {0}").format(new_name))

	rename_doc(
		doctype="Customer",
		old=old_name,
		new=new_name,
		merge=False,
		ignore_permissions=True,
		show_alert=False,
		rebuild_search=False,
	)

	if frappe.db.exists("Price List", old_name):
		rename_doc(
			doctype="Price List",
			old=old_name,
			new=new_name,
			merge=False,
			ignore_permissions=True,
			show_alert=False,
			rebuild_search=False,
		)


def validate(doc, event):
	"""Bloquear antes de guardar si el nuevo nombre ya existe."""
	if doc.is_new():
		return

	new_name = (doc.customer_name or "").strip()
	if new_name and new_name != doc.name and frappe.db.exists("Customer", new_name):
		frappe.throw(_("Ya existe un cliente con el nombre {0}").format(new_name))


def on_update(doc, event):
	"""Renombrar cuando se edita customer_name (síncrono; requiere ~7s)."""
	if not doc.has_value_changed("customer_name"):
		return

	new_name = (doc.customer_name or "").strip()
	if not new_name or new_name == doc.name:
		return

	_rename_to_customer_name(doc.name, new_name)
	doc.name = new_name


def after_insert(self, event):
	if not self.customer_group == "Proveedores" or frappe.db.exists("Price List", self.name):
		return 0

	pricls = frappe.new_doc("Price List")

	pricls.update({
		"selling": 1,
		"currency": "DOP",
		"doctype": "Price List",
		"enabled": 1,
		"price_list_name": self.name,
	})

	pricls.append("countries", {
		"country": "República Dominicana",
	})

	pricls.save()


def on_trash(self, event):
	frappe.delete_doc_if_exists("Price List", self.name)
	frappe.db.commit()
