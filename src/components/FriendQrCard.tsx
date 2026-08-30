import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/theme/ThemeProvider';

const VERSION = 4;
const SIZE = VERSION * 4 + 17;
const DATA_CODEWORDS = 80;
const ECC_CODEWORDS = 20;
const QUIET_ZONE = 4;
const MODULE_SIZE = 6;

export function getFriendProfileDeepLink(playerId: string) {
  return `pokemoncards:///player/${encodeURIComponent(playerId)}`;
}

export function FriendQrCard({
  playerId,
  username,
}: {
  playerId: string;
  username?: string | null;
}) {
  const { colors } = useAppTheme();
  const value = useMemo(() => getFriendProfileDeepLink(playerId), [playerId]);
  const matrix = useMemo(() => createQrMatrix(value), [value]);
  const fullSize = SIZE + QUIET_ZONE * 2;

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.heading}>
        <View style={[styles.iconWrap, { backgroundColor: colors.accentSoft }]}>
          <Ionicons name="qr-code" size={22} color={colors.accent} />
        </View>
        <View style={styles.headingCopy}>
          <Text style={[styles.kicker, { color: colors.yellow }]}>TRAINER LINK</Text>
          <Text style={[styles.title, { color: colors.text }]}>
            {username ? `@${username}` : 'Meu QR de amizade'}
          </Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>
            Escaneie para abrir o perfil e enviar um pedido de amizade.
          </Text>
        </View>
      </View>

      <View style={styles.qrFrame}>
        <View
          accessibilityRole="image"
          accessibilityLabel={`QR de amizade de ${username ? `@${username}` : 'treinador'}`}
          style={[
            styles.qr,
            {
              width: fullSize * MODULE_SIZE,
              height: fullSize * MODULE_SIZE,
            },
          ]}
        >
          {Array.from({ length: fullSize }).map((_, y) => (
            <View key={y} style={styles.row}>
              {Array.from({ length: fullSize }).map((__, x) => {
                const qx = x - QUIET_ZONE;
                const qy = y - QUIET_ZONE;
                const dark = qx >= 0 && qx < SIZE && qy >= 0 && qy < SIZE
                  ? matrix[qy][qx]
                  : false;
                return (
                  <View
                    key={x}
                    style={[
                      styles.module,
                      {
                        width: MODULE_SIZE,
                        height: MODULE_SIZE,
                        backgroundColor: dark ? '#05070B' : '#FFFFFF',
                      },
                    ]}
                  />
                );
              })}
            </View>
          ))}
        </View>
      </View>

      <View style={[styles.securityNote, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
        <Ionicons name="shield-checkmark" size={16} color={colors.green} />
        <Text style={[styles.securityText, { color: colors.muted }]}>
          O QR contém apenas o link público do seu Trainer Showcase. Ele não inclui e-mail, senha ou token da conta.
        </Text>
      </View>
    </View>
  );
}

function createQrMatrix(text: string): boolean[][] {
  const payload = utf8Bytes(text);
  if (payload.length > 78) {
    throw new Error('O link do perfil é grande demais para o QR local.');
  }

  const dataBits: number[] = [];
  appendBits(dataBits, 0b0100, 4);
  appendBits(dataBits, payload.length, 8);
  for (const byte of payload) appendBits(dataBits, byte, 8);

  const capacityBits = DATA_CODEWORDS * 8;
  const terminator = Math.min(4, capacityBits - dataBits.length);
  for (let i = 0; i < terminator; i += 1) dataBits.push(0);
  while (dataBits.length % 8 !== 0) dataBits.push(0);

  let padIndex = 0;
  while (dataBits.length < capacityBits) {
    appendBits(dataBits, padIndex % 2 === 0 ? 0xec : 0x11, 8);
    padIndex += 1;
  }

  const dataCodewords: number[] = [];
  for (let i = 0; i < dataBits.length; i += 8) {
    let value = 0;
    for (let bit = 0; bit < 8; bit += 1) value = (value << 1) | dataBits[i + bit];
    dataCodewords.push(value);
  }

  const divisor = reedSolomonDivisor(ECC_CODEWORDS);
  const ecc = reedSolomonRemainder(dataCodewords, divisor);
  const allBits: number[] = [];
  for (const byte of [...dataCodewords, ...ecc]) appendBits(allBits, byte, 8);

  const modules = Array.from({ length: SIZE }, () => Array<boolean>(SIZE).fill(false));
  const isFunction = Array.from({ length: SIZE }, () => Array<boolean>(SIZE).fill(false));

  const setFunction = (x: number, y: number, dark: boolean) => {
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
    modules[y][x] = dark;
    isFunction[y][x] = true;
  };

  for (let i = 0; i < SIZE; i += 1) {
    setFunction(6, i, i % 2 === 0);
    setFunction(i, 6, i % 2 === 0);
  }

  drawFinder(setFunction, 3, 3);
  drawFinder(setFunction, SIZE - 4, 3);
  drawFinder(setFunction, 3, SIZE - 4);
  drawAlignment(setFunction, 26, 26);
  drawFormatBits(setFunction, 0);

  let bitIndex = 0;
  let upward = true;
  for (let right = SIZE - 1; right >= 1; right -= 2) {
    if (right === 6) right -= 1;
    for (let vert = 0; vert < SIZE; vert += 1) {
      const y = upward ? SIZE - 1 - vert : vert;
      for (let j = 0; j < 2; j += 1) {
        const x = right - j;
        if (isFunction[y][x]) continue;
        let dark = bitIndex < allBits.length ? allBits[bitIndex] === 1 : false;
        bitIndex += 1;
        if ((x + y) % 2 === 0) dark = !dark;
        modules[y][x] = dark;
      }
    }
    upward = !upward;
  }

  return modules;
}

function drawFinder(
  setFunction: (x: number, y: number, dark: boolean) => void,
  centerX: number,
  centerY: number,
) {
  for (let dy = -4; dy <= 4; dy += 1) {
    for (let dx = -4; dx <= 4; dx += 1) {
      const distance = Math.max(Math.abs(dx), Math.abs(dy));
      setFunction(centerX + dx, centerY + dy, distance !== 2 && distance !== 4);
    }
  }
}

function drawAlignment(
  setFunction: (x: number, y: number, dark: boolean) => void,
  centerX: number,
  centerY: number,
) {
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      setFunction(centerX + dx, centerY + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }
}

function drawFormatBits(
  setFunction: (x: number, y: number, dark: boolean) => void,
  mask: number,
) {
  const errorCorrectionLevelL = 1;
  const data = (errorCorrectionLevelL << 3) | mask;
  let remainder = data;

  for (let i = 0; i < 10; i += 1) {
    remainder = (remainder << 1) ^ (((remainder >> 9) & 1) * 0x537);
  }

  const bits = ((data << 10) | remainder) ^ 0x5412;
  const getBit = (i: number) => ((bits >> i) & 1) !== 0;

  for (let i = 0; i <= 5; i += 1) setFunction(8, i, getBit(i));
  setFunction(8, 7, getBit(6));
  setFunction(8, 8, getBit(7));
  setFunction(7, 8, getBit(8));
  for (let i = 9; i < 15; i += 1) setFunction(14 - i, 8, getBit(i));

  for (let i = 0; i < 8; i += 1) setFunction(SIZE - 1 - i, 8, getBit(i));
  for (let i = 8; i < 15; i += 1) setFunction(8, SIZE - 15 + i, getBit(i));
  setFunction(8, SIZE - 8, true);
}

function appendBits(target: number[], value: number, count: number) {
  for (let i = count - 1; i >= 0; i -= 1) target.push((value >> i) & 1);
}

function reedSolomonDivisor(degree: number) {
  const result = Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;

  for (let i = 0; i < degree; i += 1) {
    for (let j = 0; j < result.length; j += 1) {
      result[j] = gfMultiply(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = gfMultiply(root, 0x02);
  }

  return result;
}

function reedSolomonRemainder(data: number[], divisor: number[]) {
  const result = Array<number>(divisor.length).fill(0);

  for (const byte of data) {
    const factor = byte ^ result[0];
    result.shift();
    result.push(0);
    for (let i = 0; i < result.length; i += 1) {
      result[i] ^= gfMultiply(divisor[i], factor);
    }
  }

  return result;
}

function gfMultiply(x: number, y: number) {
  let z = 0;
  for (let i = 7; i >= 0; i -= 1) {
    z = (z << 1) ^ ((z >> 7) * 0x11d);
    z ^= ((y >> i) & 1) * x;
  }
  return z & 0xff;
}

function utf8Bytes(value: string) {
  const bytes: number[] = [];

  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        const point = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
        bytes.push(
          0xf0 | (point >> 18),
          0x80 | ((point >> 12) & 0x3f),
          0x80 | ((point >> 6) & 0x3f),
          0x80 | (point & 0x3f),
        );
        index += 1;
      } else {
        bytes.push(0xef, 0xbf, 0xbd);
      }
    } else {
      bytes.push(
        0xe0 | (code >> 12),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }

  return bytes;
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 24,
    padding: 16,
    gap: 16,
    alignItems: 'center',
  },
  heading: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconWrap: {
    width: 46,
    height: 46,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headingCopy: {
    flex: 1,
    minWidth: 0,
  },
  kicker: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    marginTop: 2,
  },
  subtitle: {
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3,
  },
  qrFrame: {
    backgroundColor: '#FFFFFF',
    padding: 10,
    borderRadius: 22,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  qr: {
    backgroundColor: '#FFFFFF',
  },
  row: {
    flexDirection: 'row',
  },
  module: {
    flexShrink: 0,
  },
  securityNote: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 16,
    padding: 11,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  securityText: {
    flex: 1,
    fontSize: 10,
    lineHeight: 15,
  },
});
