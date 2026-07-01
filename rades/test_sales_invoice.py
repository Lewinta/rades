import unittest

import frappe

from rades.sales_invoice import _recalculate_outside_amounts


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

	def test_no_sobreescribe_lineas_ya_calculadas_por_js(self):
		# Factura ya correcta: el safeguard no debe cambiar valores existentes.
		doc = _doc(
			"Clientes Privados",
			[_line(1200.0, claimed_amount=1200.0, difference_amount=1200.0)],
		)
		_recalculate_outside_amounts(doc)
		self.assertEqual(doc["items"][0].claimed_amount, 1200.0)
		self.assertEqual(doc["items"][0].difference_amount, 1200.0)
		self.assertEqual(doc.diferencia, 1200.0)

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
