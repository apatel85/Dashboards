/// An app VoiceFlow already knows a sensible style for. [id] is lower-case: the Android package
/// name or the Windows program name. [aiTarget] is set for AI chat apps and picks the layout of
/// an AI Prompting result (Claude likes XML tags, OpenAI likes ### sections, Gemini labelled lines).
class KnownApp {
  final String id;
  final String name;
  final String profileId;
  final String group; // email | work chat | messaging | ai
  final String? aiTarget; // claude | openai | gemini | other
  const KnownApp(this.id, this.name, this.profileId, this.group,
      {this.aiTarget});
}

/// Built-in default style per app. The user's own choice (per-app memory or the Apps list in
/// Style) always wins over these. They are best-known app ids, not verified on every device: an
/// app that is not listed simply uses your default style, and any app can be set by hand.
class AppDefaults {
  static const known = <KnownApp>[
    // email: professional
    KnownApp('com.google.android.gm', 'Gmail', 'business', 'email'),
    KnownApp(
        'com.microsoft.office.outlook', 'Outlook (phone)', 'business', 'email'),
    KnownApp('outlook.exe', 'Outlook (PC)', 'business', 'email'),
    KnownApp('olk.exe', 'Outlook, new (PC)', 'business', 'email'),
    KnownApp('com.yahoo.mobile.client.android.mail', 'Yahoo Mail', 'business',
        'email'),
    KnownApp('ch.protonmail.android', 'Proton Mail', 'business', 'email'),
    KnownApp('com.samsung.android.email.provider', 'Samsung Email', 'business',
        'email'),
    // work chat: business
    KnownApp('com.slack', 'Slack (phone)', 'business', 'work chat'),
    KnownApp('slack.exe', 'Slack (PC)', 'business', 'work chat'),
    KnownApp('com.microsoft.teams', 'Microsoft Teams (phone)', 'business',
        'work chat'),
    KnownApp('ms-teams.exe', 'Microsoft Teams (PC)', 'business', 'work chat'),
    KnownApp(
        'teams.exe', 'Microsoft Teams, classic (PC)', 'business', 'work chat'),
    // personal messaging: casual
    KnownApp('com.whatsapp', 'WhatsApp (phone)', 'casual', 'messaging'),
    KnownApp('whatsapp.exe', 'WhatsApp (PC)', 'casual', 'messaging'),
    KnownApp(
        'org.telegram.messenger', 'Telegram (phone)', 'casual', 'messaging'),
    KnownApp('telegram.exe', 'Telegram (PC)', 'casual', 'messaging'),
    KnownApp('com.facebook.orca', 'Messenger', 'casual', 'messaging'),
    KnownApp('com.google.android.apps.messaging', 'Google Messages', 'casual',
        'messaging'),
    KnownApp('com.samsung.android.messaging', 'Samsung Messages', 'casual',
        'messaging'),
    KnownApp('com.discord', 'Discord (phone)', 'casual', 'messaging'),
    KnownApp('discord.exe', 'Discord (PC)', 'casual', 'messaging'),
    // AI chat apps: AI Prompting
    KnownApp('com.anthropic.claude', 'Claude (phone)', 'ai_prompting', 'ai',
        aiTarget: 'claude'),
    KnownApp('claude.exe', 'Claude (PC)', 'ai_prompting', 'ai',
        aiTarget: 'claude'),
    KnownApp('com.openai.chatgpt', 'ChatGPT (phone)', 'ai_prompting', 'ai',
        aiTarget: 'openai'),
    KnownApp('chatgpt.exe', 'ChatGPT (PC)', 'ai_prompting', 'ai',
        aiTarget: 'openai'),
    KnownApp(
        'com.google.android.apps.bard', 'Gemini (phone)', 'ai_prompting', 'ai',
        aiTarget: 'gemini'),
    KnownApp('com.microsoft.copilot', 'Microsoft Copilot', 'ai_prompting', 'ai',
        aiTarget: 'other'),
    KnownApp('ai.perplexity.app.android', 'Perplexity', 'ai_prompting', 'ai',
        aiTarget: 'other'),
    KnownApp('com.deepseek.chat', 'DeepSeek', 'ai_prompting', 'ai',
        aiTarget: 'other'),
  ];

  static final Map<String, KnownApp> _byId = {
    for (final k in known) k.id: k,
  };

  static KnownApp? find(String? appId) =>
      appId == null ? null : _byId[appId.toLowerCase()];

  static String? profileFor(String? appId) => find(appId)?.profileId;
  static String? aiTargetFor(String? appId) => find(appId)?.aiTarget;
}

/// How an AI Prompting result is laid out and how long an open-ended answer should be.
class PromptStyle {
  /// labels ("Task: ..." lines), xml (`<task>...</task>`) or markdown (`
  final String format;

  /// Open-ended requests with no spoken length get "start concise, offer more detail".
  final bool conciseFirst;
  const PromptStyle({this.format = 'labels', this.conciseFirst = false});

  /// [promptFormat] auto picks by the AI app being typed into: Claude -> xml, ChatGPT -> markdown,
  /// anything else -> labels. [aiLength] concise_first | as_said.
  static PromptStyle resolve(
      {String promptFormat = 'auto',
      String aiLength = 'concise_first',
      String? appId}) {
    var f = promptFormat;
    if (f == 'auto') {
      f = switch (AppDefaults.aiTargetFor(appId)) {
        'claude' => 'xml',
        'openai' => 'markdown',
        _ => 'labels',
      };
    }
    if (!const {'labels', 'xml', 'markdown'}.contains(f)) f = 'labels';
    return PromptStyle(format: f, conciseFirst: aiLength == 'concise_first');
  }
}
