"""Rebuild the pinned Camera RAW WASM module; requires Emscripten 6.0.9 on PATH."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.request import urlopen
import hashlib, os, re, shutil, subprocess, tarfile, tempfile

expected = 'de86b035655accff8d4010f1a221fdf50d353cb7b1422ba26f14a0db92612cfa'
compiler = shutil.which('em++')
if not compiler and os.environ.get('EMSDK'):
    compiler = str(Path(os.environ['EMSDK']) / 'upstream/emscripten/em++')
if not compiler:
    raise SystemExit('Activate Emscripten 6.0.9 or set EMSDK to its directory.')
compiler = Path(compiler)
if '6.0.9' not in subprocess.check_output([str(compiler), '--version'], text=True):
    raise SystemExit('This build pins Emscripten 6.0.9.')
with tempfile.TemporaryDirectory(prefix='openlight-libraw-') as directory:
    work = Path(directory)
    archive = work / 'source.tar.gz'
    with urlopen('https://www.libraw.org/data/LibRaw-0.22.2.tar.gz', timeout=60) as response:
        archive.write_bytes(response.read())
    if hashlib.sha256(archive.read_bytes()).hexdigest() != expected:
        raise SystemExit('LibRaw source archive checksum mismatch.')
    with tarfile.open(archive) as packed:
        packed.extractall(work, filter='data')
    source = work / 'LibRaw-0.22.2'
    manifest = (source / 'Makefile.am').read_text().split('lib_libraw_a_SOURCES =', 1)[1].split('lib_libraw_r_a_CXXFLAGS', 1)[0]
    files = [source / name for name in re.findall(r'src/[\w/]+\.cpp', manifest)]
    flags = ['-Oz', '-flto', '-fwasm-exceptions', '-std=c++17', '-DLIBRAW_NOTHREADS', '-DUSE_ZLIB', '--use-port=zlib', '-I'+str(source), '-w']
    def compile_file(path):
        output = work / (str(path.relative_to(source)).replace('/', '_')+'.o')
        subprocess.run([str(compiler), *flags, '-c', str(path), '-o', str(output)], check=True)
        return str(output)
    with ThreadPoolExecutor(max_workers=4) as pool:
        objects = list(pool.map(compile_file, files))
    library = work / 'libraw.a'
    subprocess.run([str(compiler.with_name('emar')), 'rcs', str(library), *objects], check=True)
    folder = Path(__file__).parent
    output = folder / 'vendor/libraw.mjs'
    subprocess.run([str(compiler), *flags, '-O3', str(folder/'bridge.cpp'), str(library), '-o', str(output),
        '-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker','-sALLOW_MEMORY_GROWTH=1',
        '-sSTACK_SIZE=1048576','-sMAXIMUM_MEMORY=2147483648','-sFILESYSTEM=0',
        '-sEXPORTED_FUNCTIONS=_malloc,_free','-sEXPORTED_RUNTIME_METHODS=HEAPU8,HEAPU32,HEAPF32','-sASSERTIONS=0'],check=True)
    output.write_text('/*! LibRaw 0.22.2, CDDL 1.0. Source and notices: /NOTICE */\n'+output.read_text())
    print('Camera RAW', output.with_suffix('.wasm').stat().st_size, 'WASM bytes')
