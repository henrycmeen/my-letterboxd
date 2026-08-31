import assert from "node:assert/strict";
import test from "node:test";
import {
  buildYoutubeTrailerEmbedUrl,
  isYoutubeEndedMessage,
  isYoutubePausedMessage,
  isYoutubePlayingMessage,
  shouldRestartYoutubeTrailer,
} from "./youtubeEmbed";

void test("builds a muted looping trailer URL without controls or a start offset", () => {
  const result = new URL(buildYoutubeTrailerEmbedUrl("sVwH0hIvV5k"));

  assert.equal(result.origin, "https://www.youtube-nocookie.com");
  assert.equal(result.pathname, "/embed/sVwH0hIvV5k");
  assert.equal(result.searchParams.get("autoplay"), "1");
  assert.equal(result.searchParams.get("mute"), "1");
  assert.equal(result.searchParams.get("controls"), "0");
  assert.equal(result.searchParams.get("loop"), "1");
  assert.equal(result.searchParams.get("playlist"), "sVwH0hIvV5k");
  assert.equal(result.searchParams.get("playsinline"), "1");
  assert.equal(result.searchParams.get("disablekb"), "1");
  assert.equal(result.searchParams.get("fs"), "0");
  assert.equal(result.searchParams.get("cc_load_policy"), "0");
  assert.equal(result.searchParams.get("enablejsapi"), "1");
  assert.equal(result.searchParams.has("start"), false);
  assert.equal(result.searchParams.has("modestbranding"), false);
  assert.equal(result.searchParams.has("showinfo"), false);
  assert.equal(result.searchParams.has("autohide"), false);
});

void test("recognizes YouTube playback messages before revealing the TV", () => {
  assert.equal(
    isYoutubePlayingMessage({ event: "onStateChange", info: 1 }),
    true,
  );
  assert.equal(
    isYoutubePlayingMessage({
      event: "infoDelivery",
      info: { playerState: 1 },
    }),
    true,
  );
  assert.equal(
    isYoutubePlayingMessage({ event: "onStateChange", info: 2 }),
    false,
  );
  assert.equal(isYoutubePlayingMessage("playing"), false);
});

void test("recognizes YouTube's ended state so the trailer can restart", () => {
  assert.equal(
    isYoutubeEndedMessage({ event: "onStateChange", info: 0 }),
    true,
  );
  assert.equal(
    isYoutubeEndedMessage({
      event: "infoDelivery",
      info: { playerState: 0 },
    }),
    true,
  );
  assert.equal(
    isYoutubeEndedMessage({ event: "onStateChange", info: 1 }),
    false,
  );
  assert.equal(isYoutubeEndedMessage("ended"), false);
});

void test("recognizes a trailer that pauses before the TV picture is revealed", () => {
  assert.equal(
    isYoutubePausedMessage({ event: "onStateChange", info: 2 }),
    true,
  );
  assert.equal(
    isYoutubePausedMessage({
      event: "infoDelivery",
      info: { playerState: 2 },
    }),
    true,
  );
  assert.equal(
    isYoutubePausedMessage({ event: "onStateChange", info: 1 }),
    false,
  );
  assert.equal(isYoutubePausedMessage("paused"), false);
});

void test("restarts a trailer after 90 percent so end cards never appear", () => {
  assert.equal(
    shouldRestartYoutubeTrailer({
      event: "infoDelivery",
      info: { currentTime: 89.9, duration: 100 },
    }),
    false,
  );
  assert.equal(
    shouldRestartYoutubeTrailer({
      event: "infoDelivery",
      info: { currentTime: 90, duration: 100 },
    }),
    true,
  );
  assert.equal(
    shouldRestartYoutubeTrailer({
      event: "infoDelivery",
      info: { currentTime: 180, duration: 200 },
    }),
    true,
  );
  assert.equal(
    shouldRestartYoutubeTrailer({
      event: "infoDelivery",
      info: {
        currentTime: 80.2,
        progressState: { current: 80.2, duration: 89 },
      },
    }),
    true,
  );
});

void test("ignores incomplete YouTube progress messages", () => {
  assert.equal(
    shouldRestartYoutubeTrailer({
      event: "infoDelivery",
      info: { currentTime: 90 },
    }),
    false,
  );
  assert.equal(
    shouldRestartYoutubeTrailer({
      event: "infoDelivery",
      info: { currentTime: 0, duration: 0 },
    }),
    false,
  );
  assert.equal(shouldRestartYoutubeTrailer("90 percent"), false);
});
