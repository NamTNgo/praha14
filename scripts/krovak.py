import math
def wgs_to_sjtsk(lat, lon):
    """WGS84 -> S-JTSK / Křovák East North (EPSG:5514), přesnost ~1 m."""
    # WGS84 geodetické -> kartézské
    a, f = 6378137.0, 1 / 298.257223563
    e2 = 2 * f - f * f
    B, L = math.radians(lat), math.radians(lon)
    N = a / math.sqrt(1 - e2 * math.sin(B) ** 2)
    X = N * math.cos(B) * math.cos(L); Y = N * math.cos(B) * math.sin(L); Z = N * (1 - e2) * math.sin(B)
    # Helmert WGS84 -> S-JTSK (inverze parametrů EPSG:1623/5239)
    dx, dy, dz = -570.69, -85.69, -462.84
    wx, wy, wz = math.radians(4.99821 / 3600), math.radians(1.58676 / 3600), math.radians(5.2611 / 3600)
    m = -3.543e-6
    X2 = dx + (1 + m) * (X + wz * Y - wy * Z)
    Y2 = dy + (1 + m) * (-wz * X + Y + wx * Z)
    Z2 = dz + (1 + m) * (wy * X - wx * Y + Z)
    # kartézské -> Bessel
    a, f = 6377397.155, 1 / 299.1528128
    e2 = 2 * f - f * f
    p = math.hypot(X2, Y2); L = math.atan2(Y2, X2)
    B = math.atan2(Z2, p * (1 - e2))
    for _ in range(6):
        N = a / math.sqrt(1 - e2 * math.sin(B) ** 2)
        B = math.atan2(Z2 + e2 * N * math.sin(B), p)
    # Křovák
    e = math.sqrt(e2)
    phi0, lam0 = math.radians(49.5), math.radians(24 + 50 / 60)   # od Ferra = 42°30' + 17°40'
    alfa = math.sqrt(1 + e2 * math.cos(phi0) ** 4 / (1 - e2))
    U0 = math.asin(math.sin(phi0) / alfa)
    g = (1 + e * math.sin(phi0)) ** (alfa * e / 2) / (math.tan(phi0 / 2 + math.pi / 4) ** alfa * (1 - e * math.sin(phi0)) ** (alfa * e / 2))
    k = math.tan(U0 / 2 + math.pi / 4) / ((math.tan(phi0 / 2 + math.pi / 4) ** alfa) * ((1 - e * math.sin(phi0)) / (1 + e * math.sin(phi0))) ** (alfa * e / 2))
    kp = 0.9999
    R = a * math.sqrt(1 - e2) / (1 - e2 * math.sin(phi0) ** 2)
    U = 2 * (math.atan(k * math.tan(B / 2 + math.pi / 4) ** alfa * ((1 - e * math.sin(B)) / (1 + e * math.sin(B))) ** (alfa * e / 2)) - math.pi / 4)
    dV = alfa * (lam0 - L)
    a_k = math.radians(30 + 17 / 60 + 17.30311 / 3600)
    S = math.asin(math.cos(a_k) * math.sin(U) + math.sin(a_k) * math.cos(U) * math.cos(dV))
    D = math.asin(math.cos(U) * math.sin(dV) / math.cos(S))
    S0 = math.radians(78.5)
    n = math.sin(S0)
    rho0 = kp * R / math.tan(S0)
    rho = rho0 * (math.tan(S0 / 2 + math.pi / 4) / math.tan(S / 2 + math.pi / 4)) ** n
    eps = n * D
    Xk = rho * math.cos(eps); Yk = rho * math.sin(eps)
    return -Yk, -Xk
