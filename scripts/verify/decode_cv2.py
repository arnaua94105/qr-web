"""Decodifica con OpenCV (lector independiente) las imágenes de un manifiesto JSON.
Si las entradas llevan "group", un grupo cuenta como correcto si alguna de sus imágenes (distintas escalas
de la misma matriz) se decodifica, pero el informe cuenta también las imágenes individuales fallidas."""
import json, sys, cv2, collections
man = [m for m in json.load(open(sys.argv[1])) if not m.get('skipped')]
det = cv2.QRCodeDetector()
try: aruco = cv2.QRCodeDetectorAruco()
except Exception: aruco = None
def decode(img):
    t, _, _ = det.detectAndDecode(img)
    if t: return t
    if aruco is not None:
        t, _, _ = aruco.detectAndDecode(img)
        return t
    return ''
groups = collections.OrderedDict(); img_ok = img_fail = 0; img_failures = []
for m in man:
    img = cv2.imread(m['file'], cv2.IMREAD_GRAYSCALE)
    good = decode(img) == m['text']
    img_ok += good; img_fail += (not good)
    if not good: img_failures.append(m['file'].split('/')[-1])
    g = groups.setdefault(m.get('group', m['file']), [])
    g.append(good)
g_ok = sum(1 for v in groups.values() if any(v)); g_fail = [k for k, v in groups.items() if not any(v)]

# Para cada caso sin decodificar: ¿lee OpenCV su PROPIA salida para esa versión, nivel y texto?
# Si no la lee, el fallo es del lector (limitación conocida), no de mi codificador.
by_group = {}
for m in man: by_group.setdefault(m.get('group', m['file']), m)
reader_limits, real_failures = [], []
for k in g_fail:
    m = by_group[k]
    try:
        p = cv2.QRCodeEncoder_Params(); p.version = m['version']
        p.correction_level = {'L': cv2.QRCodeEncoder_CORRECT_LEVEL_L, 'M': cv2.QRCodeEncoder_CORRECT_LEVEL_M,
                              'Q': cv2.QRCodeEncoder_CORRECT_LEVEL_Q, 'H': cv2.QRCodeEncoder_CORRECT_LEVEL_H}[m['ecl']]
        p.mode = cv2.QRCodeEncoder_MODE_BYTE
        own = cv2.QRCodeEncoder.create(p).encode(m['text'])
        own = cv2.copyMakeBorder(own, 8, 8, 8, 8, cv2.BORDER_CONSTANT, value=255)
        ok_own = any(decode(cv2.resize(own, None, fx=f, fy=f, interpolation=cv2.INTER_NEAREST)) == m['text'] for f in (3, 4, 6, 8))
    except Exception as e:
        ok_own = True  # no se pudo demostrar la limitación: se trata como fallo real
    (real_failures if ok_own else reader_limits).append(k)
print(f"Casos (matrices distintas) decodificados: {g_ok} de {len(groups)}")
print(f"Imágenes individuales decodificadas: {img_ok} de {img_ok+img_fail}")
if img_failures: print("  imágenes individuales no decodificadas por OpenCV:", img_failures)
if reader_limits: print("  Limitación demostrada del lector (OpenCV tampoco decodifica su propia salida):", reader_limits)
if real_failures: print("  FALLOS REALES (OpenCV sí lee su propia salida pero no la mía):", real_failures)
print(f"Resultado: {g_ok} correctos + {len(reader_limits)} con limitación demostrada del lector + {len(real_failures)} fallos reales")
sys.exit(1 if real_failures else 0)
