import 'package:test/test.dart';
import 'package:voiceflow_core/voiceflow_core.dart';
import 'helpers.dart';

void main() {
  RuleFormatter at(int hour) =>
      RuleFormatter(loadLang(), clock: () => DateTime(2026, 11, 15, hour, 20));
  String fmt(RuleFormatter f, String s) => f.format(s, loadProfile('casual'));

  group('clock times get AM/PM from the time of day', () {
    test('evening: nine forty five -> 9:45 PM (the WhatsApp case)', () {
      expect(fmt(at(20), 'we can connect after nine forty five that works'),
          'We can connect after 9:45 PM that works.');
      expect(fmt(at(20), 'we can connect after 945 that works.'),
          'We can connect after 9:45 PM that works.');
      expect(fmt(at(20), 'we can connect after 9.45 that works.'),
          'We can connect after 9:45 PM that works.');
    });
    test('morning: the same words become AM', () {
      expect(fmt(at(8), 'we can connect after nine forty five that works'),
          'We can connect after 9:45 AM that works.');
      expect(
          fmt(at(11), 'the call is at ten thirty'), 'The call is at 10:30 AM.');
    });
    test('noon and later is PM', () {
      expect(
          fmt(at(12), 'the call is at ten thirty'), 'The call is at 10:30 PM.');
    });
    test('a spoken AM/PM or period of day always wins', () {
      expect(fmt(at(20), 'see you around twelve fifteen pm'),
          'See you around 12:15 PM.');
      expect(fmt(at(20), 'the call is at nine thirty am'),
          'The call is at 9:30 AM.');
      expect(fmt(at(20), 'the call is at eight fifteen in the morning'),
          'The call is at 8:15 in the morning.');
      expect(
          fmt(at(8), 'we start at 9:45 tonight'), 'We start at 9:45 tonight.');
    });
    test('oh-minutes and teens', () {
      expect(fmt(at(20), 'the call is at eleven oh five'),
          'The call is at 11:05 PM.');
      expect(fmt(at(9), 'call me before eight fifteen'),
          'Call me before 8:15 AM.');
    });
    test('addresses, rooms, quantities and plain hours are not times', () {
      expect(fmt(at(20), 'i live at 945 Main Street'),
          'I live at 945 Main Street.');
      expect(fmt(at(20), 'room 945 is free'), 'Room 945 is free.');
      expect(
          fmt(at(20), 'we sold nine forty five units'), isNot(contains(':')));
      expect(
          fmt(at(20), 'we need to be at 9.45 percent'), isNot(contains(':')));
      expect(at(20).format('the call is at ten am', loadProfile('business')),
          'The call is at 10 am.');
      expect(
          fmt(at(20), 'send it to john at nine'), 'Send it to John at nine.');
    });
  });
}
