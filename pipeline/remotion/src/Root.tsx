import React from 'react';
import { Composition, registerRoot } from 'remotion';
import { ShortVideo } from './Video';
import { defaultVideoProps, type VideoProps } from './types';

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="ShortVideo"
      component={ShortVideo}
      durationInFrames={defaultVideoProps.totalDurationInFrames}
      fps={defaultVideoProps.fps}
      width={defaultVideoProps.width}
      height={defaultVideoProps.height}
      defaultProps={defaultVideoProps}
      calculateMetadata={async ({ props }) => {
        const p = props as VideoProps;
        return {
          durationInFrames: Math.max(1, p.totalDurationInFrames || defaultVideoProps.totalDurationInFrames),
          fps: p.fps || defaultVideoProps.fps,
          width: p.width || defaultVideoProps.width,
          height: p.height || defaultVideoProps.height,
        };
      }}
    />
  );
};

registerRoot(RemotionRoot);
