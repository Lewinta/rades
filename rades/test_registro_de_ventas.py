import unittest

import frappe

from rades.rades.report.registro_de_ventas.registro_de_ventas import get_query


def _filters(**kw):
    base = dict(from_date="2026-01-01", to_date="2026-12-31")
    base.update(kw)
    return frappe._dict(base)


class TestRegistroDeVentasQuery(unittest.TestCase):
    def test_sin_ars_no_menciona_el_valor(self):
        sql = str(get_query(_filters()))
        self.assertNotIn("ARS HUMANO", sql)

    def test_con_ars_agrega_condicion_por_ese_valor(self):
        base = str(get_query(_filters()))
        con = str(get_query(_filters(ars="ARS HUMANO")))
        self.assertNotEqual(con, base)
        self.assertIn("ARS HUMANO", con)

    def test_ars_y_tipo_de_factura_coexisten(self):
        sql = str(
            get_query(_filters(tipo_de_factura="Clientes Seguros", ars="ARS PALIC"))
        )
        self.assertIn("Clientes Seguros", sql)
        self.assertIn("ARS PALIC", sql)
