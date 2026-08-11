"""Renombra custom_print_qty -> print_qty para compatibilidad con codigo existente.

Uso:
  bench --site <site> execute rades.maintenance.rename_custom_print_qty_to_print_qty.run
"""

import json

import frappe


def _real_columns(doctype: str) -> list[str]:
	table = f"tab{doctype}"
	return [row.Field for row in frappe.db.sql(f"SHOW COLUMNS FROM `{table}`", as_dict=True)]


def _clear_column_cache(doctype: str) -> None:
	table = f"tab{doctype}"
	cache_key = f"table_columns::{table}"
	frappe.cache.delete_value(cache_key)
	try:
		frappe.client_cache.delete_value(cache_key)
	except Exception:
		pass


def run():
	doctype = "Sales Invoice Item"
	table = f"tab{doctype}"
	old_name = "custom_print_qty"
	new_name = "print_qty"

	cf_name = frappe.db.get_value("Custom Field", {"dt": doctype, "fieldname": old_name})
	if not cf_name:
		if frappe.db.get_value("Custom Field", {"dt": doctype, "fieldname": new_name}):
			print(f"Ya existe el Custom Field {new_name}, nada que hacer.")
			return
		frappe.throw(f"No existe el Custom Field {old_name}")

	cols = _real_columns(doctype)

	if old_name not in cols:
		frappe.throw(f"La columna {old_name} no existe en la tabla.")

	if new_name in cols:
		new_type = next(
			(row.Type for row in frappe.db.sql(f"SHOW COLUMNS FROM `{table}` LIKE %s", (new_name,), as_dict=True)),
			"",
		)
		if "varchar" in (new_type or ""):
			frappe.db.sql(
				f"""
				UPDATE `{table}`
				SET `{old_name}` = CAST(`{new_name}` AS UNSIGNED)
				WHERE IFNULL(`{new_name}`, '') != ''
				  AND (`{old_name}` = 0 OR `{old_name}` IS NULL)
				"""
			)
			frappe.db.sql_ddl(f"ALTER TABLE `{table}` DROP COLUMN `{new_name}`")
		else:
			frappe.throw(f"La columna {new_name} ya existe y no es la varchar legacy.")

	frappe.db.sql_ddl(
		f"ALTER TABLE `{table}` CHANGE `{old_name}` `{new_name}` int(11) NOT NULL DEFAULT 0"
	)

	frappe.db.set_value("Custom Field", cf_name, "fieldname", new_name, update_modified=False)

	frappe.db.sql(
		"""
		UPDATE `tabCustom Field`
		SET insert_after = %s
		WHERE dt = %s AND insert_after = %s
		""",
		(new_name, doctype, old_name),
	)

	ps = frappe.db.get_value(
		"Property Setter",
		{"doc_type": doctype, "property": "field_order"},
		["name", "value"],
		as_dict=True,
	)
	if ps and ps.value:
		order = json.loads(ps.value)
		if old_name in order:
			order = [new_name if f == old_name else f for f in order]
			frappe.db.set_value("Property Setter", ps.name, "value", json.dumps(order))

	_clear_column_cache(doctype)
	frappe.clear_cache(doctype=doctype)
	print(f"Listo: {old_name} renombrado a {new_name}.")
