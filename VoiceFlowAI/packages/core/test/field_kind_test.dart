import 'package:test/test.dart';
import 'package:voiceflow_core/voiceflow_core.dart';
import 'helpers.dart';

void main() {
  final f = FieldFormatter(loadLang());
  test(
      'email: spoken symbols become real ones, no spaces, no capitals, no final period',
      () {
    expect(f.format('John at Example dot com', FieldKind.email),
        'john@example.com');
    expect(
        f.format('um jane dot doe underscore 99 at gmail dot com period',
            FieldKind.email),
        'jane.doe_99@gmail.com');
    expect(f.format('first dash last at work dot co dot uk', FieldKind.email),
        'first-last@work.co.uk');
  });
  test('url: dot, slash, colon; "at" stays a word', () {
    expect(f.format('example dot com slash docs slash intro', FieldKind.url),
        'example.com/docs/intro');
    expect(f.format('https colon slash slash site dot io', FieldKind.url),
        'https://site.io');
    expect(f.format('meet at site dot io', FieldKind.url), 'meetatsite.io');
  });
  test('number: words to digits, nothing else', () {
    expect(f.format('four hundred twelve', FieldKind.number), '412');
    expect(f.format('five five five one two one two', FieldKind.number),
        '5551212');
    expect(f.format('um twenty twenty four', FieldKind.number), '2024');
  });
  test(
      'punctuation the speech engine attaches to words is dropped, inner dots kept',
      () {
    expect(f.format('Example.com.', FieldKind.url), 'example.com');
    expect(f.format('Call me, maybe? yes!', FieldKind.url), 'callmemaybeyes');
    expect(f.format('john@example.com.', FieldKind.email), 'john@example.com');
  });
  test('empty / filler-only input gives an empty string', () {
    expect(f.format('um uh', FieldKind.email), '');
  });
  test('hostile input cannot inject markup characters (<>()) into a field', () {
    expect(f.format('<script> alert(1) </script>', FieldKind.url),
        'scriptalert1/script');
  });
}
