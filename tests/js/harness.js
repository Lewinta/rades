/**
 * Arnes minimo para ejecutar rades/public/js/sales_invoice.js fuera del desk.
 *
 * Reproduce solo lo que el script de la factura toca: los globales de Frappe
 * (frappe.model.set_value con su semantica de "solo si cambia", run_serially,
 * flt) y los handlers nativos de ERPNext que compiten con los de rades sobre
 * rate / discount_amount / price_list_rate. Sin esto no hay forma de probar el
 * calculo de seguros, que vive entero en el cliente.
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SOURCE = path.resolve(__dirname, "../../rades/public/js/sales_invoice.js");

function flt(value, precision) {
	let v = parseFloat(value);
	if (isNaN(v) || v === Infinity) v = 0;
	if (precision === undefined || precision === null) return v;
	const factor = Math.pow(10, precision);
	// Redondeo half-away-from-zero, igual que frappe.utils.flt en el cliente.
	return Math.sign(v) * Math.round(Math.abs(v) * factor + Number.EPSILON) / factor;
}

function cint(value) {
	const v = parseInt(value, 10);
	return isNaN(v) ? 0 : v;
}

// Precision por tipo de campo, como precision() del desk.
const PERCENT_FIELDS = new Set(["discount_percentage"]);
function precision(fieldname) {
	return PERCENT_FIELDS.has(fieldname) ? 3 : 2;
}

function make_jquery() {
	const chainable = new Proxy(function () {}, {
		get: () => chainable,
		apply: () => chainable,
	});

	const $ = (...args) => chainable;

	$.each = (obj, fn) => {
		if (Array.isArray(obj)) obj.forEach((v, i) => fn(i, v));
		else Object.keys(obj || {}).forEach((k) => fn(k, obj[k]));
		return obj;
	};
	$.map = (arr, fn) => (arr || []).map((v, i) => fn(v, i)).filter((v) => v != null);
	$.grep = (arr, fn) => (arr || []).filter((v, i) => fn(v, i));
	$.extend = Object.assign;
	$.isPlainObject = (o) => !!o && typeof o === "object" && !Array.isArray(o);
	return $;
}

/**
 * Handlers nativos de ERPNext (erpnext/public/js/controllers/transaction.js y
 * taxes_and_totals.js) que intervienen cuando se teclea el Monto de una linea.
 * Se registran ANTES que los de rades, que es el orden real en el desk.
 */
function register_erpnext_handlers(frappe, ctx) {
	const { flt } = ctx;

	function apply_pricing_rule_on_item(item) {
		const effective_item_rate = item.price_list_rate;

		if (item.margin_type === "Percentage") {
			item.rate_with_margin =
				flt(effective_item_rate) +
				(flt(effective_item_rate) * flt(item.margin_rate_or_amount)) / 100;
		} else {
			item.rate_with_margin = flt(effective_item_rate) + flt(item.margin_rate_or_amount);
		}

		let item_rate = flt(item.rate_with_margin, precision("rate"));

		if (item.discount_percentage && !item.discount_amount) {
			item.discount_amount = (flt(item.rate_with_margin) * flt(item.discount_percentage)) / 100;
		}

		if (item.discount_amount > 0) {
			item_rate = flt(item.rate_with_margin - item.discount_amount, precision("rate"));
			item.discount_percentage = (100 * flt(item.discount_amount)) / flt(item.rate_with_margin);
		}

		return frappe.model.set_value(item.doctype, item.name, "rate", item_rate);
	}

	function price_list_rate_handler(frm, cdt, cdn) {
		const item = frappe.get_doc(cdt, cdn);
		return apply_pricing_rule_on_item(item);
	}

	function apply_discount_on_item(frm, cdt, cdn, field) {
		const item = frappe.get_doc(cdt, cdn);
		if (item && !item.price_list_rate) {
			item[field] = 0.0;
			return;
		}
		return price_list_rate_handler(frm, cdt, cdn);
	}

	frappe.ui.form.on("Sales Invoice Item", "rate", (frm, cdt, cdn) => {
		const item = frappe.get_doc(cdt, cdn);
		item.rate = flt(item.rate, precision("rate"));
		item.price_list_rate = flt(item.price_list_rate, precision("price_list_rate"));

		if (item.price_list_rate && !item.blanket_order_rate) {
			if (item.rate > item.price_list_rate) {
				item.discount_percentage = 0;
				item.margin_type = "Amount";
				item.margin_rate_or_amount = flt(
					item.rate - item.price_list_rate,
					precision("margin_rate_or_amount")
				);
				item.rate_with_margin = item.rate;
			} else {
				item.discount_percentage = flt(
					(1 - item.rate / item.price_list_rate) * 100.0,
					precision("discount_percentage")
				);
				item.discount_amount = flt(item.price_list_rate) - flt(item.rate);
				item.margin_type = "";
				item.margin_rate_or_amount = 0;
				item.rate_with_margin = 0;
			}
		}
		item.amount = flt(item.rate * item.qty, precision("amount"));
	});

	frappe.ui.form.on("Sales Invoice Item", "price_list_rate", price_list_rate_handler);
	frappe.ui.form.on("Sales Invoice Item", "discount_amount", (frm, cdt, cdn) =>
		apply_discount_on_item(frm, cdt, cdn, "discount_amount")
	);
	frappe.ui.form.on("Sales Invoice Item", "discount_percentage", (frm, cdt, cdn) =>
		apply_discount_on_item(frm, cdt, cdn, "discount_percentage")
	);
	frappe.ui.form.on("Sales Invoice Item", "margin_rate_or_amount", price_list_rate_handler);
	frappe.ui.form.on("Sales Invoice Item", "margin_type", price_list_rate_handler);
}

/**
 * Crea un entorno cargado con el script real y devuelve utilidades para
 * manejar un formulario de Sales Invoice.
 */
function load_sales_invoice_script() {
	const $ = make_jquery();
	const locals = {};
	const handlers = {}; // doctype -> fieldname/evento -> [fn]
	let current_frm = null;

	const frappe = {
		boot: {
			conf: {
				ofertas_jueves: [],
				descuentos_especiales: [],
				autorizado_por_seguros: 80,
			},
		},
		provide(namespace) {
			const parts = namespace.split(".");
			let target = ctx;
			parts.forEach((part) => {
				target[part] = target[part] || {};
				target = target[part];
			});
			return target;
		},
		ui: {
			form: {
				on(doctype, arg1, arg2) {
					handlers[doctype] = handlers[doctype] || {};
					const add = (name, fn) => {
						handlers[doctype][name] = handlers[doctype][name] || [];
						handlers[doctype][name].push(fn);
					};
					if (typeof arg1 === "string") add(arg1, arg2);
					else Object.keys(arg1).forEach((name) => add(name, arg1[name]));
				},
				get_open_grid_form: () => null,
			},
		},
		meta: {
			docfield_map: { "Sales Invoice": {} },
			get_docfield: () => ({}),
			has_field: () => true,
		},
		user: { has_role: () => true },
		utils: { filter_dict: () => [] },
		db: { get_value: () => Promise.resolve({}) },
		call: () => ({ done: () => ({ fail: () => {} }) }),
		show_alert() {},
		msgprint() {},
		throw(message) {
			throw new Error(message);
		},
		timeout: () => Promise.resolve(),
		async run_serially(tasks) {
			let out;
			for (const task of tasks || []) {
				if (typeof task === "function") out = await task();
				else out = await task;
			}
			return out;
		},
		get_doc: (doctype, name) => locals[doctype] && locals[doctype][name],
		model: {
			get_doc: (doctype, name) => locals[doctype] && locals[doctype][name],
			async set_value(doctype, docname, fieldname, value) {
				const doc = locals[doctype] && locals[doctype][docname];
				if (!doc) return;
				if (doc[fieldname] === value) return; // semantica real: solo si cambia
				doc[fieldname] = value;
				return frappe.model.trigger(fieldname, value, doc);
			},
			async trigger(fieldname, value, doc) {
				const fns = (handlers[doc.doctype] || {})[fieldname] || [];
				for (const fn of fns) {
					await fn(current_frm, doc.doctype, doc.name);
				}
			},
			round_floats_in(doc, fields) {
				(fields || []).forEach((f) => (doc[f] = flt(doc[f], precision(f))));
			},
		},
	};

	const erpnext = {
		payments: class {},
		taxes_and_totals: class {
			set_total_amount_to_default_mop() {}
		},
	};

	const ctx = {
		console,
		Math,
		Date,
		JSON,
		Number,
		Object,
		Array,
		String,
		Boolean,
		parseFloat,
		parseInt,
		isNaN,
		Promise,
		setTimeout,
		flt,
		cint,
		precision,
		$,
		jQuery: $,
		locals,
		frappe,
		erpnext,
		__: (s) => s,
		refresh_field: () => {},
		get_today: undefined, // el propio script define su get_today(frm)
		cur_frm: { copy_doc: () => {}, refresh_fields: () => {} },
	};
	ctx.window = ctx;
	ctx.globalThis = ctx;

	vm.createContext(ctx);
	register_erpnext_handlers(frappe, ctx);
	vm.runInContext(fs.readFileSync(SOURCE, "utf8"), ctx, { filename: SOURCE });

	/** Construye un formulario con sus lineas y lo deja como frm activo. */
	function make_form(doc_fields, items) {
		const doc = Object.assign(
			{
				doctype: "Sales Invoice",
				name: "new-sales-invoice-1",
				docstatus: 0,
				is_return: 0,
				is_pos: 0,
				posting_date: "2026-08-19",
				conversion_rate: 1,
				payments: [],
				items: [],
			},
			doc_fields
		);

		locals["Sales Invoice"] = locals["Sales Invoice"] || {};
		locals["Sales Invoice"][doc.name] = doc;
		locals["Sales Invoice Item"] = locals["Sales Invoice Item"] || {};

		(items || []).forEach((row, idx) => {
			const item = Object.assign(
				{
					doctype: "Sales Invoice Item",
					name: `row-${idx + 1}`,
					parent: doc.name,
					parenttype: "Sales Invoice",
					idx: idx + 1,
					qty: 1,
					copago: 0,
					discount_percentage: 0,
					discount_amount: 0,
					margin_type: "",
					margin_rate_or_amount: 0,
					rate_with_margin: 0,
				},
				row
			);
			item.amount = flt(item.rate * item.qty, 2);
			locals["Sales Invoice Item"][item.name] = item;
			doc.items.push(item);
		});

		const frm = {
			doc,
			doctype: "Sales Invoice",
			docname: doc.name,
			events: handlers["Sales Invoice"] ? {} : {},
			cscript: { calculate_paid_amount: () => {}, calculate_taxes_and_totals: () => {} },
			fields_dict: {},
			dashboard: null,
			is_new: () => true,
			is_dirty: () => true,
			async trigger(name) {
				const fns = (handlers["Sales Invoice"] || {})[name] || [];
				for (const fn of fns) await fn(frm);
			},
			async set_value(fieldname, value) {
				if (doc[fieldname] === value) return;
				doc[fieldname] = value;
				const fns = (handlers["Sales Invoice"] || {})[fieldname] || [];
				for (const fn of fns) await fn(frm);
			},
			set_df_property: () => {},
			toggle_display: () => {},
			toggle_enable: () => {},
			toggle_reqd: () => {},
			refresh_field: () => {},
			refresh_fields: () => {},
			refresh: () => {},
			add_custom_button: () => {},
			clear_custom_buttons: () => {},
			clear_table: () => {},
			add_child: () => {},
			set_query: () => {},
			get_field: () => ({}),
		};

		// frm.events expone los handlers de cabecera (item_table_update, etc.)
		Object.keys(handlers["Sales Invoice"] || {}).forEach((name) => {
			frm.events[name] = (...args) => {
				const fns = handlers["Sales Invoice"][name];
				return frappe.run_serially(fns.map((fn) => () => fn(...args)));
			};
		});

		current_frm = frm;
		ctx.cur_frm = frm;
		return frm;
	}

	/** Simula que el usuario teclea un valor en una celda del grid. */
	async function user_types(frm, row, fieldname, value) {
		await frappe.model.set_value(row.doctype, row.name, fieldname, value);
		// El desk deja correr los triggers asincronos del script antes de que el
		// usuario siga; run_serially ya los encadeno, esto vacia la microcola.
		await new Promise((resolve) => setTimeout(resolve, 0));
	}

	return { frappe, make_form, user_types, flt, ctx };
}

module.exports = { load_sales_invoice_script, flt };
