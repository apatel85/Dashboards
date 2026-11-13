/// Word error rate = (substitutions + deletions + insertions) / reference words,
/// after lower-casing and dropping punctuation. Used by the STT accuracy check.
double wordErrorRate(String reference, String hypothesis) {
  List<String> words(String s) => s
      .toLowerCase()
      .replaceAll(RegExp(r"[^a-z0-9'\s]"), ' ')
      .split(RegExp(r'\s+'))
      .where((w) => w.isNotEmpty)
      .toList();
  final r = words(reference), h = words(hypothesis);
  if (r.isEmpty) return h.isEmpty ? 0 : 1;
  var prev = List<int>.generate(h.length + 1, (i) => i);
  for (var i = 1; i <= r.length; i++) {
    final cur = <int>[i];
    for (var j = 1; j <= h.length; j++) {
      final cost = r[i - 1] == h[j - 1] ? 0 : 1;
      cur.add([prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost]
          .reduce((a, b) => a < b ? a : b));
    }
    prev = cur;
  }
  return prev.last / r.length;
}
