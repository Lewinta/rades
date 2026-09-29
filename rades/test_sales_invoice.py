import unittest
from unittest.mock import patch

import frappe
import frappe.utils.data as frappe_data

from rades.sales_invoice import (
	_apply_return_sign,
	_pending_mop_amount,
	_rounded_payments_total,
	_recalculate_outside_amounts,
	_restore_seguro_selling_price_list,
	_return_payment_rows,
	_should_restore_return_payments,
)


def setUpModule():
	# flt(..., precision) delega en `rounded`, que consulta System Settings para
	# el método de redondeo. Sin sitio conectado eso lanza y flt devuelve 0.0,
	# así que se stubea igual que en alanube/controllers/test_sales_invoice_totals.
	if not getattr(frappe_data, "__rades_test_rounded_patched__", False):

		def _rounded(num, precision, rounding_method=None):
			return round(float(num), int(precision))

		frappe_data.rounded = _rounded
		frappe_data.__rades_test_rounded_patched__ = True


def _doc(tipo, items, **header):
	"""Construye un doc-like (frappe._dict) con líneas, sin tocar la BD."""
	campos = dict(
		tipo_de_factura=tipo,
		monto_reclamado=0.0,
		monto_autorizado=0.0,
		diferencia=0.0,
		items=[frappe._dict(it) for it in items],
	)
	# `header` pisa los defaults, para poder partir de un doc ya con montos.
	campos.update(header)
	return frappe._dict(campos)


def _line(amount, item_name="Estudio", **kw):
	base = dict(
		item_name=item_name,
		amount=amount,
		rate=amount,
		qty=1.0,
		price_list_rate=amount,
		rate_with_margin=0.0,
		cobertura=0.0,
		copago=0.0,
		claimed_amount=0.0,
		authorized_amount=0.0,
		difference_amount=0.0,
	)
	base.update(kw)
	return base


class TestRecalculateOutsideAmounts(unittest.TestCase):
	def test_factura_privada_sin_montos_se_rellena_la_diferencia(self):
		# Caso del bug: factura no-seguro enviada antes de que el JS calculara.
		doc = _doc("Clientes Privados", [_line(3000.0)])
		_recalculate_outside_amounts(doc)
		self.assertEqual(doc["items"][0].claimed_amount, 3000.0)
		self.assertEqual(doc["items"][0].difference_amount, 3000.0)
		self.assertEqual(doc.diferencia, 3000.0)
		self.assertEqual(doc.monto_reclamado, 3000.0)
		self.assertEqual(doc.monto_autorizado, 0.0)

	def test_tipo_vacio_tambien_se_rellena(self):
		# FACT-93197 tenía tipo_de_factura = "" y aun así debe calcular diferencia.
		doc = _doc("", [_line(1200.0)])
		_recalculate_outside_amounts(doc)
		self.assertEqual(doc.diferencia, 1200.0)
		self.assertEqual(doc.monto_reclamado, 1200.0)

	def test_es_idempotente_en_facturas_ya_correctas(self):
		# Factura ya correcta: recalcular no debe cambiar nada.
		doc = _doc(
			"Clientes Privados",
			[_line(1200.0, claimed_amount=1200.0, difference_amount=1200.0)],
		)
		_recalculate_outside_amounts(doc)
		self.assertEqual(doc["items"][0].claimed_amount, 1200.0)
		self.assertEqual(doc["items"][0].difference_amount, 1200.0)
		self.assertEqual(doc.diferencia, 1200.0)

	def test_margen_sube_el_rate_y_la_diferencia_lo_sigue(self):
		# Caso FACT-170020: precio de lista 2,159 + margen de 48,627.79 dejan el
		# rate en 50,786.79, pero claimed/difference se quedaron en el precio de
		# lista. difference_amount es lo que alanube manda a la DGII, así que el
		# e-CF salía por 2,159 mientras la factura contabilizaba 50,786.79.
		doc = _doc(
			"Alquiler",
			[
				_line(
					50786.79,
					price_list_rate=2159.0,
					margin_type="Amount",
					margin_rate_or_amount=48627.79,
					claimed_amount=2159.0,
					difference_amount=2159.0,
				)
			],
		)
		_recalculate_outside_amounts(doc)
		self.assertEqual(doc["items"][0].claimed_amount, 50786.79)
		self.assertEqual(doc["items"][0].difference_amount, 50786.79)
		self.assertEqual(doc.diferencia, 50786.79)

	def test_descuento_baja_el_rate_y_la_diferencia_lo_sigue(self):
		# Simétrico: un descuento deja el rate por debajo del precio de lista.
		doc = _doc(
			"Clientes Privados",
			[
				_line(
					800.0,
					price_list_rate=1000.0,
					discount_amount=200.0,
					claimed_amount=1000.0,
					difference_amount=1000.0,
				)
			],
		)
		_recalculate_outside_amounts(doc)
		self.assertEqual(doc["items"][0].claimed_amount, 800.0)
		self.assertEqual(doc["items"][0].difference_amount, 800.0)
		self.assertEqual(doc.diferencia, 800.0)

	def test_proveedores_ignora_la_cobertura_100_de_api(self):
		# api.update_sales_invoice arma la línea con cobertura=100, pero la regla
		# es que fuera de seguros el autorizado siempre es 0 y todo va a la
		# diferencia. Aplicar la cobertura dejaría difference_amount en 0 y el
		# e-CF se enviaría por 0.
		doc = _doc("Proveedores", [_line(15000.0, cobertura=100.0)])
		_recalculate_outside_amounts(doc)
		self.assertEqual(doc["items"][0].authorized_amount, 0.0)
		self.assertEqual(doc["items"][0].difference_amount, 15000.0)
		self.assertEqual(doc.diferencia, 15000.0)
		self.assertEqual(doc.monto_autorizado, 0.0)

	def test_difference_amount_es_unitario_no_por_linea(self):
		# alanube.get_item_line_difference_amount multiplica difference_amount
		# por qty para armar el e-CF, así que el campo tiene que ser el unitario.
		# Usar amount (rate * qty) haría que el e-CF saliera por rate * qty².
		line = _line(500.0, qty=3.0)
		line["amount"] = 1500.0  # rate * qty, como lo deja ERPNext
		doc = _doc("Clientes Privados", [line])
		_recalculate_outside_amounts(doc)
		self.assertEqual(doc["items"][0].difference_amount, 500.0)
		self.assertEqual(doc["items"][0].claimed_amount, 500.0)

	def test_facturas_de_seguro_no_se_tocan(self):
		# La lógica de seguros queda intacta: el safeguard no debe rellenar nada.
		doc = _doc("Clientes Seguros", [_line(1200.0)])
		_recalculate_outside_amounts(doc)
		self.assertEqual(doc["items"][0].claimed_amount, 0.0)
		self.assertEqual(doc["items"][0].difference_amount, 0.0)
		self.assertEqual(doc.diferencia, 0.0)

	def test_linea_diferencia_no_suma_a_reclamado_pero_si_a_diferencia(self):
		# Línea cuyo nombre empieza con "Diferencia": no es reclamable al seguro,
		# pero su monto sí es diferencia (paga el paciente).
		doc = _doc("Clientes Privados", [_line(500.0, item_name="Diferencia consulta")])
		_recalculate_outside_amounts(doc)
		self.assertEqual(doc["items"][0].claimed_amount, 0.0)
		self.assertEqual(doc["items"][0].difference_amount, 500.0)
		self.assertEqual(doc.monto_reclamado, 0.0)
		self.assertEqual(doc.diferencia, 500.0)

	def test_copago_reduce_la_diferencia(self):
		# difference = amount - authorized - copago
		doc = _doc("Clientes Privados", [_line(1200.0, copago=200.0)])
		_recalculate_outside_amounts(doc)
		self.assertEqual(doc["items"][0].difference_amount, 1000.0)
		self.assertEqual(doc.diferencia, 1000.0)


class TestApplyReturnSign(unittest.TestCase):
	"""En una nota de crédito los montos custom van en negativo, como amount.

	Caso real: FACT-170537 (Clientes Seguros, grand_total 3,230.72). Su nota de
	crédito mostraba Monto Reclamado +3,231.30 y Autorizado +2,801.12 contra un
	Grand Total de -3,231.30.
	"""

	def test_nc_de_seguros_invierte_el_signo_de_las_lineas_copiadas(self):
		# make_sales_return copia los montos de la factura en positivo y
		# _recalculate_outside_amounts no toca las de seguro: el signo tiene que
		# ponerlo _apply_return_sign.
		doc = _doc(
			"Clientes Seguros",
			[
				_line(
					556.34,
					qty=-1.0,
					claimed_amount=556.34,
					authorized_amount=500.71,
					difference_amount=55.63,
				)
			],
			is_return=1,
		)
		_apply_return_sign(doc)
		item = doc["items"][0]
		self.assertEqual(item.claimed_amount, -556.34)
		self.assertEqual(item.authorized_amount, -500.71)
		self.assertEqual(item.difference_amount, -55.63)
		self.assertEqual(doc.monto_reclamado, -556.34)
		self.assertEqual(doc.monto_autorizado, -500.71)
		self.assertEqual(doc.diferencia, -55.63)

	def test_nc_privada_tras_recalcular_queda_en_negativo(self):
		# Caso FACT-170568: grand_total -5,800 pero monto_reclamado +5,800.
		doc = _doc("Clientes Privados", [_line(5000.0, qty=-1.0)], is_return=1)
		_recalculate_outside_amounts(doc)
		_apply_return_sign(doc)
		self.assertEqual(doc["items"][0].claimed_amount, -5000.0)
		self.assertEqual(doc["items"][0].difference_amount, -5000.0)
		self.assertEqual(doc.monto_reclamado, -5000.0)
		self.assertEqual(doc.diferencia, -5000.0)

	def test_el_header_se_resuma_desde_las_lineas(self):
		doc = _doc(
			"Clientes Seguros",
			[
				_line(100.0, claimed_amount=100.0, authorized_amount=80.0, difference_amount=20.0),
				_line(50.0, claimed_amount=50.0, authorized_amount=40.0, difference_amount=10.0),
			],
			is_return=1,
			monto_reclamado=999.0,
		)
		_apply_return_sign(doc)
		self.assertEqual(doc.monto_reclamado, -150.0)
		self.assertEqual(doc.monto_autorizado, -120.0)
		self.assertEqual(doc.diferencia, -30.0)

	def test_el_copago_del_header_tambien_va_en_negativo(self):
		doc = _doc("Clientes Seguros", [_line(100.0)], is_return=1, copago=25.0)
		_apply_return_sign(doc)
		self.assertEqual(doc.copago, -25.0)

	def test_es_idempotente(self):
		# validate corre en cada save: aplicar dos veces no puede volver a girar
		# el signo.
		doc = _doc(
			"Clientes Seguros",
			[_line(100.0, claimed_amount=100.0, authorized_amount=80.0, difference_amount=20.0)],
			is_return=1,
		)
		_apply_return_sign(doc)
		primera = dict(doc["items"][0])
		_apply_return_sign(doc)
		self.assertEqual(dict(doc["items"][0]), primera)
		self.assertEqual(doc.diferencia, -20.0)

	def test_una_factura_normal_no_se_toca(self):
		doc = _doc(
			"Clientes Seguros",
			[_line(100.0, claimed_amount=100.0, authorized_amount=80.0, difference_amount=20.0)],
			monto_reclamado=100.0,
		)
		_apply_return_sign(doc)
		self.assertEqual(doc["items"][0].claimed_amount, 100.0)
		self.assertEqual(doc["items"][0].difference_amount, 20.0)
		self.assertEqual(doc.monto_reclamado, 100.0)


class TestReturnPayments(unittest.TestCase):
	"""Pagos POS de una nota de crédito: en negativo y con el desglose original."""

	def _source(self, payments, **kw):
		base = dict(conversion_rate=1.0, payments=[frappe._dict(p) for p in payments])
		base.update(kw)
		return frappe._dict(base)

	def test_las_filas_se_copian_en_negativo(self):
		source = self._source(
			[
				{"mode_of_payment": "Seguro", "amount": 2800.66, "base_amount": 2800.66, "account": "Caja"},
				{"mode_of_payment": "Tarjetas de credito", "amount": 430.06, "base_amount": 430.06},
			]
		)
		rows = _return_payment_rows(source)
		self.assertEqual([r["mode_of_payment"] for r in rows], ["Seguro", "Tarjetas de credito"])
		self.assertEqual([r["amount"] for r in rows], [-2800.66, -430.06])
		self.assertEqual([r["base_amount"] for r in rows], [-2800.66, -430.06])
		self.assertEqual(rows[0]["account"], "Caja")

	def test_base_amount_se_deriva_del_conversion_rate_si_falta(self):
		source = self._source(
			[{"mode_of_payment": "Efectivo", "amount": 100.0}], conversion_rate=60.0
		)
		self.assertEqual(_return_payment_rows(source)[0]["base_amount"], -6000.0)

	def test_un_monto_ya_negativo_no_se_vuelve_a_girar(self):
		source = self._source([{"mode_of_payment": "Efectivo", "amount": -100.0}])
		self.assertEqual(_return_payment_rows(source)[0]["amount"], -100.0)

	def test_se_prorratea_en_una_devolucion_parcial(self):
		source = self._source(
			[
				{"mode_of_payment": "Seguro", "amount": 800.0},
				{"mode_of_payment": "Efectivo", "amount": 200.0},
			]
		)
		rows = _return_payment_rows(source, target_total=-500.0)
		self.assertEqual([r["amount"] for r in rows], [-400.0, -100.0])
		self.assertEqual(sum(r["amount"] for r in rows), -500.0)

	def test_el_prorrateo_cuadra_exacto_pese_al_redondeo(self):
		# 1/3 de 100 no es exacto: el sobrante se absorbe en la fila mayor para
		# que la suma sea idéntica al grand_total de la nota.
		source = self._source(
			[
				{"mode_of_payment": "Seguro", "amount": 100.0},
				{"mode_of_payment": "Efectivo", "amount": 100.0},
				{"mode_of_payment": "Co-Pago", "amount": 100.0},
			]
		)
		rows = _return_payment_rows(source, target_total=-100.0)
		self.assertEqual(round(sum(r["amount"] for r in rows), 2), -100.0)

	def test_una_devolucion_total_no_se_altera_por_el_prorrateo(self):
		source = self._source(
			[
				{"mode_of_payment": "Seguro", "amount": 2800.66},
				{"mode_of_payment": "Tarjetas de credito", "amount": 430.06},
			]
		)
		rows = _return_payment_rows(source, target_total=-3230.72)
		self.assertEqual([r["amount"] for r in rows], [-2800.66, -430.06])

	def test_se_reconstruye_cuando_todos_los_pagos_quedaron_en_cero(self):
		# Síntoma reportado: al guardar, los pagos de la NC quedan en 0.00.
		doc = _doc(
			"Clientes Seguros",
			[_line(100.0)],
			is_return=1,
			is_pos=1,
			grand_total=-658.05,
			return_against="FACT-170537",
			payments=[frappe._dict(mode_of_payment="Efectivo", amount=0.0)],
		)
		self.assertTrue(_should_restore_return_payments(doc))

	def test_se_reconstruye_cuando_los_pagos_no_suman_el_total(self):
		# Caso FACT-170543: grand_total -1,974.15 con pagos por -1,374.18.
		# Y FACT-170704, donde ERPNext colapsó el desglose dejando -1.1e-13:
		# la regla no puede ser "todos en cero", tiene que ser "no cuadran".
		doc = _doc(
			"Clientes Seguros",
			[_line(100.0)],
			is_return=1,
			is_pos=1,
			grand_total=-1974.15,
			return_against="FACT-169655",
			payments=[frappe._dict(mode_of_payment="Efectivo", amount=-1374.18)],
		)
		self.assertTrue(_should_restore_return_payments(doc))

	def test_no_se_reconstruye_si_los_pagos_ya_cuadran(self):
		doc = _doc(
			"Clientes Seguros",
			[_line(100.0)],
			is_return=1,
			is_pos=1,
			grand_total=-3230.72,
			return_against="FACT-170537",
			payments=[
				frappe._dict(mode_of_payment="Seguro", amount=-2800.66),
				frappe._dict(mode_of_payment="Tarjetas de credito", amount=-430.06),
			],
		)
		self.assertFalse(_should_restore_return_payments(doc))

	def test_no_se_reconstruye_fuera_de_pos_ni_fuera_de_devolucion(self):
		sin_pos = _doc(
			"Clientes Seguros",
			[_line(100.0)],
			is_return=1,
			is_pos=0,
			grand_total=-100.0,
			return_against="FACT-170537",
			payments=[],
		)
		sin_return = _doc(
			"Clientes Seguros",
			[_line(100.0)],
			is_return=0,
			is_pos=1,
			grand_total=100.0,
			return_against=None,
			payments=[],
		)
		self.assertFalse(_should_restore_return_payments(sin_pos))
		self.assertFalse(_should_restore_return_payments(sin_return))

	def test_el_residuo_binario_no_cuenta_como_pendiente(self):
		# Caso FACT-170704, y la razon real del "los pagos se ponen en 0":
		# ERPNext compara `pending_amount > 0` sin redondear en
		# set_total_amount_to_default_mop. Los pagos de la nota ya cuadran con el
		# total, pero la resta en coma flotante deja 1.1e-13, ERPNext cree que
		# falta por pagar, vacia la tabla de pagos y mete una sola fila con ese
		# residuo en positivo -que despues el mismo rechaza por no ser negativo.
		total = -658.05
		pagado = -526.44 + -131.61
		self.assertNotEqual(total - pagado, 0.0)
		self.assertEqual(_pending_mop_amount(total, pagado), 0.0)

	def test_la_suma_de_pagos_redondeada_cuadra_con_el_total(self):
		# Segunda cara del mismo residuo: validate_pos_return compara
		# `total_amount_in_payments < invoice_total` sin redondear, asi que
		# -658.0500000000001 < -658.05 y la nota se rechazaba con "El monto total
		# de los pagos no puede ser mayor que 658.05".
		pagos = [frappe._dict(amount=-526.44), frappe._dict(amount=-131.61)]
		self.assertLess(sum(p.amount for p in pagos), -658.05)
		self.assertEqual(_rounded_payments_total(pagos), -658.05)
		self.assertFalse(_rounded_payments_total(pagos) < -658.05)

	def test_un_pendiente_real_si_se_reporta(self):
		# Un faltante de verdad tiene que seguir llegando al comportamiento
		# original de ERPNext.
		self.assertEqual(_pending_mop_amount(-658.05, -500.0), -158.05)

	def test_no_se_reconstruye_sin_total_calculado(self):
		# Documento a medio armar: sin grand_total no hay contra qué comparar y
		# prorratear contra 0 borraría los pagos.
		doc = _doc(
			"Clientes Seguros",
			[],
			is_return=1,
			is_pos=1,
			grand_total=0.0,
			return_against="FACT-170537",
			payments=[],
		)
		self.assertFalse(_should_restore_return_payments(doc))


class TestRestoreSeguroSellingPriceList(unittest.TestCase):
	"""ERPNext set_pos_fields pisa la lista de precios al validar una factura POS.

	Con is_pos=1 elige customer.default_price_list -> customer_group -> POS
	Profile, o sea "Venta estándar", aunque la factura sea de una ARS. Desde la
	migración de junio de 2026 todas las facturas de seguro de csrd quedaron así, y
	al reabrir un borrador cada línea nueva se cotizaba al precio privado
	(FACT-95232: Mamografia Bilateral a 3,000 en vez de 1,320 de SENASA).
	"""

	def setUp(self):
		patcher = patch(
			"rades.sales_invoice._enabled_price_list_currency",
			side_effect=lambda name: {
				"ARS SENASA CONTRIBUTIVO": "DOP",
				"Meds": "DOP",
				"Venta estándar": "DOP",
				"ARS EN DOLARES": "USD",
			}.get(name),
		)
		patcher.start()
		self.addCleanup(patcher.stop)

	def _factura(self, tipo, ars, **kw):
		header = dict(
			ars=ars,
			is_return=0,
			selling_price_list="Venta estándar",
			price_list_currency="DOP",
		)
		header.update(kw)
		return _doc(tipo, [], **header)

	def test_seguro_recupera_la_lista_de_la_ars(self):
		doc = self._factura("Clientes Seguros", "ARS SENASA CONTRIBUTIVO")
		_restore_seguro_selling_price_list(doc)
		self.assertEqual(doc.selling_price_list, "ARS SENASA CONTRIBUTIVO")

	def test_meds_usa_su_propia_lista(self):
		doc = self._factura("Meds", "Meds")
		_restore_seguro_selling_price_list(doc)
		self.assertEqual(doc.selling_price_list, "Meds")

	def test_servimerd_sin_ars_queda_en_venta_estandar(self):
		doc = self._factura("Servimerd", None, selling_price_list="Meds")
		_restore_seguro_selling_price_list(doc)
		self.assertEqual(doc.selling_price_list, "Venta estándar")

	def test_nota_de_credito_no_se_toca(self):
		# La NC hereda la lista de la factura original; cambiarla la re-cotiza.
		doc = self._factura("Clientes Seguros", "ARS SENASA CONTRIBUTIVO", is_return=1)
		_restore_seguro_selling_price_list(doc)
		self.assertEqual(doc.selling_price_list, "Venta estándar")

	def test_factura_privada_no_se_toca(self):
		doc = self._factura("Clientes Privados", "ARS SENASA CONTRIBUTIVO")
		_restore_seguro_selling_price_list(doc)
		self.assertEqual(doc.selling_price_list, "Venta estándar")

	def test_lista_inexistente_o_deshabilitada_no_se_toca(self):
		doc = self._factura("Clientes Seguros", "ARS SIN LISTA")
		_restore_seguro_selling_price_list(doc)
		self.assertEqual(doc.selling_price_list, "Venta estándar")

	def test_lista_en_otra_moneda_no_se_toca(self):
		# plc_conversion_rate ya se validó para la moneda actual; no se cambia
		# a una lista que la dejaría incoherente.
		doc = self._factura("Clientes Seguros", "ARS EN DOLARES")
		_restore_seguro_selling_price_list(doc)
		self.assertEqual(doc.selling_price_list, "Venta estándar")
