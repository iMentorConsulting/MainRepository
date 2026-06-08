import React from 'react';
import {Composition, staticFile} from 'remotion';
import {getVideoMetadata} from '@remotion/media-utils';
import {Reel2, Reel2Props, getReel2DurationInFrames} from './Reel2';
import {FPS, HEIGHT, WIDTH} from './timeline';
import {SCREEN_RECORDING_1, SCREEN_RECORDING_2} from './footage';

export const Root: React.FC = () => {
	return (
		<>
			<Composition
				id="Reel2-ExperienceAndSystem"
				component={Reel2}
				fps={FPS}
				width={WIDTH}
				height={HEIGHT}
				// Placeholders -- overwritten by calculateMetadata once the real
				// screen-recording durations are measured from the files in public/footage.
				durationInFrames={getReel2DurationInFrames(180, 180)}
				defaultProps={{
					video1DurationInFrames: 180,
					video2DurationInFrames: 180,
				} satisfies Reel2Props}
				calculateMetadata={async ({props}) => {
					const [meta1, meta2] = await Promise.all([
						getVideoMetadata(staticFile(`footage/${SCREEN_RECORDING_1}`)),
						getVideoMetadata(staticFile(`footage/${SCREEN_RECORDING_2}`)),
					]);

					const video1DurationInFrames = Math.round(meta1.durationInSeconds * FPS);
					const video2DurationInFrames = Math.round(meta2.durationInSeconds * FPS);

					return {
						props: {
							...props,
							video1DurationInFrames,
							video2DurationInFrames,
						},
						durationInFrames: getReel2DurationInFrames(video1DurationInFrames, video2DurationInFrames),
					};
				}}
			/>
		</>
	);
};
