import React from 'react';
import { AbsoluteFill, Audio, Img, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import type { SceneProps, VideoProps } from './types';

function kenBurnsScale(motion: SceneProps['motion'], progress: number): { scale: number; x: number; y: number } {
  switch (motion) {
    case 'ken-burns-in':
      return { scale: 1 + 0.15 * progress, x: 0, y: 0 };
    case 'ken-burns-out':
      return { scale: 1.15 - 0.15 * progress, x: 0, y: 0 };
    case 'pan-left':
      return { scale: 1.12, x: 40 * (1 - progress), y: 0 };
    case 'pan-right':
      return { scale: 1.12, x: -40 * (1 - progress), y: 0 };
    case 'static':
    default:
      return { scale: 1, x: 0, y: 0 };
  }
}

/** Local file paths from the pipeline are made servable to Remotion via
 * staticFile() when they live under the project's public/ dir; the CLI wires
 * that copy step (see README). For paths already inside remotion/public we
 * pass through as-is. */
function resolveAsset(filePath: string): string {
  if (!filePath) return '';
  if (filePath.startsWith('http://') || filePath.startsWith('https://')) return filePath;
  const marker = 'public/';
  const idx = filePath.replace(/\\/g, '/').indexOf(marker);
  if (idx >= 0) return staticFile(filePath.slice(idx + marker.length));
  return filePath;
}

const Scene: React.FC<{ scene: SceneProps }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [0, scene.durationInFrames], [0, 1], { extrapolateRight: 'clamp' });
  const { scale, x, y } = kenBurnsScale(scene.motion, progress);
  const opacity = interpolate(frame, [0, 8, scene.durationInFrames - 8, scene.durationInFrames], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ backgroundColor: '#000', opacity }}>
      {scene.imagePath ? (
        <Img
          src={resolveAsset(scene.imagePath)}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: `scale(${scale}) translate(${x}px, ${y}px)`,
          }}
        />
      ) : null}
      {scene.onScreenText ? (
        <AbsoluteFill style={{ justifyContent: 'flex-start', alignItems: 'center', paddingTop: 140 }}>
          <div
            style={{
              fontFamily: 'sans-serif',
              fontWeight: 800,
              fontSize: 64,
              color: 'white',
              textAlign: 'center',
              textShadow: '0 4px 20px rgba(0,0,0,0.8)',
              padding: '0 60px',
            }}
          >
            {scene.onScreenText}
          </div>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};

const CaptionOverlay: React.FC<{ props: VideoProps }> = ({ props }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const active = props.captions.find((c) => t >= c.start && t < c.end);
  if (!active) return null;
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 220 }}>
      <div
        style={{
          fontFamily: 'sans-serif',
          fontWeight: 700,
          fontSize: 44,
          color: 'white',
          background: 'rgba(0,0,0,0.55)',
          borderRadius: 16,
          padding: '16px 28px',
          maxWidth: '85%',
          textAlign: 'center',
          textShadow: '0 2px 8px rgba(0,0,0,0.6)',
        }}
      >
        {active.text}
      </div>
    </AbsoluteFill>
  );
};

export const ShortVideo: React.FC<VideoProps> = (props) => {
  let cursor = 0;
  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      {props.audioPath ? <Audio src={resolveAsset(props.audioPath)} /> : null}
      {props.musicPath ? <Audio src={resolveAsset(props.musicPath)} volume={0.15} /> : null}
      {props.scenes.map((scene) => {
        const from = cursor;
        cursor += scene.durationInFrames;
        return (
          <Sequence key={scene.index} from={from} durationInFrames={scene.durationInFrames} layout="none">
            <Scene scene={scene} />
          </Sequence>
        );
      })}
      <CaptionOverlay props={props} />
    </AbsoluteFill>
  );
};
