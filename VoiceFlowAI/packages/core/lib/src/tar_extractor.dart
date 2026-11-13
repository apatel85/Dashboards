import 'dart:io';
import 'package:archive/archive.dart';
import 'model_spec.dart';

/// Streams a .tar.bz2 and writes only the wanted files (by basename) into
/// [dest]. Memory stays small (bzip2 is decoded lazily, tar entries are copied
/// in chunks). Entry paths are never used for output, so `../` tricks in an
/// archive cannot write outside [dest].
class TarBz2Extractor {
  static Future<void> extract(
      File archive, Directory dest, Set<String> wanted) async {
    await dest.create(recursive: true);
    final input = InputFileStream(archive.path);
    final tar = BZip2Decoder().decodeLazy(input);
    final found = <String>{};
    String? longName;
    try {
      while (!tar.isEOS) {
        final header = tar.readBytes(512).toUint8List();
        if (header.length < 512) break;
        if (header.every((b) => b == 0)) break; // end-of-archive block
        var name = _str(header, 0, 100);
        final prefix = _str(header, 345, 155);
        if (prefix.isNotEmpty) name = '$prefix/$name';
        final size = int.tryParse(_str(header, 124, 12).trim(), radix: 8) ?? 0;
        final type = header[156] == 0 ? 0x30 : header[156];
        final padded = (size + 511) ~/ 512 * 512;

        if (type == 0x4c /* 'L' GNU long name */) {
          longName = _str(tar.readBytes(size).toUint8List(), 0, size);
          tar.skip(padded - size);
          continue;
        }
        if (type == 0x78 || type == 0x67 /* pax headers */) {
          tar.skip(padded);
          continue;
        }
        if (longName != null) {
          name = longName;
          longName = null;
        }
        final base = name.split('/').last;
        if (type == 0x30 && wanted.contains(base) && !found.contains(base)) {
          final tmp = File('${dest.path}/$base.part');
          final sink = tmp.openSync(mode: FileMode.write);
          try {
            var left = size;
            while (left > 0) {
              final n = left < 1 << 20 ? left : 1 << 20;
              sink.writeFromSync(tar.readBytes(n).toUint8List());
              left -= n;
            }
          } finally {
            sink.closeSync();
          }
          tar.skip(padded - size);
          await tmp.rename('${dest.path}/$base');
          found.add(base);
        } else {
          tar.skip(padded);
        }
      }
    } finally {
      await input.close();
    }
    final missing = wanted.difference(found);
    if (missing.isNotEmpty) {
      throw ModelIntegrityException(
          'archive is missing: ${missing.join(', ')}');
    }
  }

  static String _str(List<int> b, int off, int len) {
    var end = off;
    while (end < off + len && end < b.length && b[end] != 0) {
      end++;
    }
    return String.fromCharCodes(b.sublist(off, end));
  }
}
