export interface SceneProps {
  index: number;
  imagePath: string;
  onScreenText: string;
  voiceover: string;
  durationInFrames: number;
  motion: 'ken-burns-in' | 'ken-burns-out' | 'pan-left' | 'pan-right' | 'static';
}

export interface CaptionCue {
  start: number; // seconds
  end: number; // seconds
  text: string;
}

export interface VideoProps {
  fps: number;
  width: number;
  height: number;
  title: string;
  audioPath: string;
  musicPath: string | null;
  captions: CaptionCue[];
  scenes: SceneProps[];
  totalDurationInFrames: number;
}

export const defaultVideoProps: VideoProps = {
  fps: 30,
  width: 1080,
  height: 1920,
  title: 'Untitled',
  audioPath: '',
  musicPath: null,
  captions: [],
  scenes: [],
  totalDurationInFrames: 150,
};
