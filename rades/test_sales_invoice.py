import unittest
from unittest.mock import patch

import frappe
import frappe.utils.data as frappe_data

from rades.sales_invoice import (
	_recalculate_outside_amounts,
	_restore_seguro_selling_price_list,
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
	d = frappe._dict(
		tipo_de_factura=tipo,
		monto_reclamado=0.0,
		monto_autorizado=0.0,
		diferencia=0.0,
		items=[frappe._dict(it) for it in items],
		**header,
	)
	return d


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
