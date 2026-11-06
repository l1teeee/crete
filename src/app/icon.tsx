import { ImageResponse } from "next/og";

const BACKGROUND_COLOR = "#000000";
const DOT_COLOR = "#ffffff";
const DOT_SIZE = 6;

export const size = {
  width: 32,
  height: 32,
};
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: BACKGROUND_COLOR,
        }}
      >
        <div
          style={{
            width: DOT_SIZE,
            height: DOT_SIZE,
            borderRadius: "50%",
            background: DOT_COLOR,
          }}
        />
      </div>
    ),
    {
      ...size,
    }
  );
}
