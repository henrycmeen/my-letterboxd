import assert from "node:assert/strict";
import test from "node:test";
import {
  buildYoutubeTrailerEmbedUrl,
  isYoutubePlayingMessage,
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
