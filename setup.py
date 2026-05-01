# -*- coding: utf-8 -*-
from setuptools import setup, find_packages
import re, ast

# get version from __version__ variable in rades/__init__.py
_version_re = re.compile(r'__version__\s+=\s+(.*)')

with open('rades/__init__.py', 'rb') as f:
    version = str(ast.literal_eval(_version_re.search(
        f.read().decode('utf-8')).group(1)))


setup(
	name='rades',
	version=version,
	description='Aplicacion para centro de diagnostico',
	author='Lewin Villar',
	author_email='lewin.villar@gmail.com',
	packages=find_packages(),
	zip_safe=False,
	include_package_data=True,
	install_requires=[],
	dependencies=[]
)
