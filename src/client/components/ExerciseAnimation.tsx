import { useState } from 'react';

export interface ExerciseMeta {
  id: string;
  name: string;
  focusMuscles: string[];
  secondaryMuscles: string[];
  equipment: string;
  defaultDuration: string;
  instructions: string[];
  cues: string[];
}

export const FRIDAY_EXERCISE_DATA: Record<string, ExerciseMeta> = {
  backward_lunge: {
    id: 'backward_lunge',
    name: 'Backward Lunge',
    focusMuscles: ['Glutes', 'Quadriceps'],
    secondaryMuscles: ['Hamstrings', 'Calves', 'Core'],
    equipment: 'Bodyweight or Dumbbells',
    defaultDuration: '00:30',
    instructions: [
      'Stand with your feet shoulder width apart and your hands on your hips.',
      'Step a big step backward with your right leg and lower your body until your left thigh is parallel to the floor.',
      'Press through the front heel to return and repeat with the other side.',
    ],
    cues: ['Keep torso upright', '90 degree angles in both knees', 'Push through front heel'],
  },
  jumping_jacks: {
    id: 'jumping_jacks',
    name: 'Jumping Jacks',
    focusMuscles: ['Cardio', 'Calves'],
    secondaryMuscles: ['Shoulders', 'Core', 'Quads'],
    equipment: 'Bodyweight',
    defaultDuration: '00:30',
    instructions: [
      'Stand upright with your legs together and arms at your sides.',
      'Bend your knees slightly and jump into the air, spreading your legs shoulder-width apart while stretching arms out and overhead.',
      'Jump back to starting position and repeat at a brisk, steady rhythm.',
    ],
    cues: ['Land softly on balls of feet', 'Rhythmic breathing', 'Full arm arc'],
  },
  squats: {
    id: 'squats',
    name: 'Squats',
    focusMuscles: ['Quadriceps', 'Glutes'],
    secondaryMuscles: ['Hamstrings', 'Lower Back', 'Core'],
    equipment: 'Bodyweight or Dumbbells',
    defaultDuration: '00:30',
    instructions: [
      'Stand with feet shoulder-width apart, toes turned slightly out.',
      'Hinge at your hips and bend your knees, extending your arms forward for balance.',
      'Lower until thighs are parallel to the floor, keeping your chest proud.',
      'Drive through your full feet to stand tall and squeeze glutes at the top.',
    ],
    cues: ['Knees track over toes', 'Keep chest proud', 'Full foot pressure'],
  },
  wall_push_ups: {
    id: 'wall_push_ups',
    name: 'Wall Push-Ups',
    focusMuscles: ['Chest', 'Triceps'],
    secondaryMuscles: ['Front Delts', 'Core'],
    equipment: 'Wall or Bodyweight',
    defaultDuration: '00:30',
    instructions: [
      'Stand facing a wall about an arm’s length away with feet shoulder-width apart.',
      'Place your palms flat against the wall at shoulder height and shoulder-width apart.',
      'Bend your elbows to bring your chest close to the wall while keeping your body in a straight plank.',
      'Push firmly back to the starting position.',
    ],
    cues: ['Keep body in straight line', 'Elbows at 45 degrees', 'Breathe out as you press'],
  },
  chin_ups: {
    id: 'chin_ups',
    name: 'Chin-Ups',
    focusMuscles: ['Lats', 'Biceps'],
    secondaryMuscles: ['Upper Back', 'Forearms', 'Core'],
    equipment: 'Pull-up Bar',
    defaultDuration: '4 x 5-10',
    instructions: [
      'Grip the pull-up bar with an underhand grip (palms facing you) shoulder-width apart.',
      'Hang with arms fully extended and engage your core to eliminate swinging.',
      'Pull your chest toward the bar by driving your elbows down and back until your chin clears the bar.',
      'Lower under control to a full stretch and repeat.',
    ],
    cues: ['Chest to bar', 'Squeeze biceps & lats at apex', 'Control the 3-second descent'],
  },
  chest_supported_row: {
    id: 'chest_supported_row',
    name: 'Chest-Supported Dumbbell Row',
    focusMuscles: ['Upper Back', 'Lats'],
    secondaryMuscles: ['Rear Delts', 'Biceps', 'Rhomboids'],
    equipment: 'Incline Bench & Dumbbells',
    defaultDuration: '4 x 8-12',
    instructions: [
      'Set an adjustable bench to a 30–45 degree incline and rest your chest against the pad.',
      'Hold a dumbbell in each hand with neutral grip, arms hanging straight down.',
      'Retract your shoulder blades and pull elbows up and back toward your hips.',
      'Pause for a second at peak contraction, then slowly lower dumbbells.',
    ],
    cues: ['Keep chest pinned to bench', 'Pull with elbows, not hands', 'Full stretch at bottom'],
  },
  dumbbell_pullover: {
    id: 'dumbbell_pullover',
    name: 'Dumbbell Pullover',
    focusMuscles: ['Lats', 'Serratus'],
    secondaryMuscles: ['Chest', 'Triceps Long Head', 'Core'],
    equipment: 'Flat Bench & Dumbbell',
    defaultDuration: '3 x 10-15',
    instructions: [
      'Lie perpendicular across a flat bench or lengthwise, holding a dumbbell with both hands under the inner plate.',
      'Hold the weight directly over your chest with a slight soft bend in your elbows.',
      'Slowly lower the dumbbell in an arc behind your head until you feel a deep stretch in your lats and ribcage.',
      'Pull the dumbbell back over your chest using your lats, keeping hips stable.',
    ],
    cues: ['Keep elbow angle locked', 'Breathe in on descent', 'Pull from armpits'],
  },
  rear_delt_fly: {
    id: 'rear_delt_fly',
    name: 'Rear-Delt Dumbbell Fly',
    focusMuscles: ['Rear Delts', 'Upper Back'],
    secondaryMuscles: ['Traps', 'Rhomboids'],
    equipment: 'Dumbbells',
    defaultDuration: '3 x 12-20',
    instructions: [
      'Stand with feet hip-width apart and hinge at the hips until your torso is nearly parallel to the floor.',
      'Let the dumbbells hang below your chest with palms facing each other and soft elbows.',
      'Raise the dumbbells out to the sides in a wide arc until elbows reach shoulder height.',
      'Squeeze the back of your shoulders at the top, then lower with control.',
    ],
    cues: ['Lead with elbows', 'No swinging or momentum', 'Feel rear delts pinch'],
  },
  dumbbell_shrug: {
    id: 'dumbbell_shrug',
    name: 'Dumbbell Shrug',
    focusMuscles: ['Traps'],
    secondaryMuscles: ['Neck', 'Forearms'],
    equipment: 'Dumbbells',
    defaultDuration: '3 x 10-15',
    instructions: [
      'Stand upright with feet shoulder-width apart, holding a pair of heavy dumbbells at your sides.',
      'Keep arms straight and elevate your shoulders straight up toward your ears as high as possible.',
      'Hold the peak contraction at the top for 1 full second.',
      'Lower your shoulders smoothly back down to a full stretch without rolling them.',
    ],
    cues: ['Elevate straight up', 'Pause at the peak', 'Do not roll shoulders'],
  },
  incline_curl: {
    id: 'incline_curl',
    name: 'Incline Dumbbell Curl',
    focusMuscles: ['Biceps'],
    secondaryMuscles: ['Forearms', 'Brachialis'],
    equipment: 'Incline Bench & Dumbbells',
    defaultDuration: '3 x 10-15',
    instructions: [
      'Sit back on an incline bench set to 45–60 degrees with a dumbbell in each hand.',
      'Let your arms hang straight down behind your torso to put the long head of the bicep on stretch.',
      'Curl the dumbbells up while supinating your wrists (turning palms up).',
      'Squeeze hard at the peak, then lower slowly over 2–3 seconds.',
    ],
    cues: ['Keep elbows pinned behind torso', 'Full bicep stretch', 'Control the negative'],
  },
  suitcase_carry: {
    id: 'suitcase_carry',
    name: 'Suitcase Carry',
    focusMuscles: ['Core', 'Obliques'],
    secondaryMuscles: ['Forearms', 'Traps', 'Glutes'],
    equipment: 'Single Dumbbell or Kettlebell',
    defaultDuration: '3 x 30-45 sec / side',
    instructions: [
      'Pick up a heavy dumbbell in one hand like a suitcase at your side.',
      'Brace your core tightly, pull shoulders back, and keep your torso perfectly upright with no lateral tilt.',
      'Walk forward with slow, deliberate, heel-to-toe steps.',
      'Switch hands after the designated time and repeat.',
    ],
    cues: ['Resist leaning to the side', 'Short controlled strides', 'Ribs down and tight'],
  },
  half_burpees: {
    id: 'half_burpees',
    name: 'Half Burpees',
    focusMuscles: ['Full Body', 'Cardio'],
    secondaryMuscles: ['Core', 'Quads', 'Shoulders'],
    equipment: 'Bodyweight',
    defaultDuration: '3-4 rounds x 1 min',
    instructions: [
      'Start in a standing position, then drop into a squat and place hands on the floor.',
      'Jump both feet backward into a strong high plank position.',
      'Immediately jump both feet back forward toward your hands into a squat.',
      'Stand up explosively and repeat the circuit.',
    ],
    cues: ['Do not let hips sag in plank', 'Fast transitions', 'Rhythmic breathing'],
  },
  mountain_climbers: {
    id: 'mountain_climbers',
    name: 'Mountain Climbers',
    focusMuscles: ['Core', 'Cardio'],
    secondaryMuscles: ['Shoulders', 'Hip Flexors', 'Quads'],
    equipment: 'Bodyweight',
    defaultDuration: '3-4 rounds x 1 min',
    instructions: [
      'Start in a tall plank position with wrists directly under shoulders and body in a straight line.',
      'Drive your right knee forward toward your chest without letting your hips pike up.',
      'Quickly switch legs, driving the left knee forward while extending the right leg back.',
      'Continue alternating in a smooth, continuous running motion.',
    ],
    cues: ['Keep hips level', 'Press hands firmly into floor', 'Drive knees explosively'],
  },
  chair_squats: {
    id: 'chair_squats',
    name: 'Chair Squats',
    focusMuscles: ['Quadriceps', 'Glutes'],
    secondaryMuscles: ['Hamstrings', 'Core'],
    equipment: 'Chair or Bench',
    defaultDuration: '3-4 rounds x 1 min',
    instructions: [
      'Stand about 4 inches in front of a sturdy chair with feet shoulder-width apart.',
      'Reach your hips back and lower down under control until glutes lightly tap the chair seat.',
      'Do not rest your full weight—immediately drive through your heels to stand back up.',
    ],
    cues: ['Tap chair lightly, do not collapse', 'Drive through mid-foot & heels', 'Chest stays high'],
  },
  bicycle_crunches: {
    id: 'bicycle_crunches',
    name: 'Bicycle Crunches',
    focusMuscles: ['Abs', 'Obliques'],
    secondaryMuscles: ['Hip Flexors', 'Lower Abs'],
    equipment: 'Mat',
    defaultDuration: '3-4 rounds x 1 min',
    instructions: [
      'Lie flat on your back with hands lightly behind your head and knees bent at 90 degrees.',
      'Lift your shoulder blades off the floor and rotate your torso, bringing right elbow toward left knee as right leg extends.',
      'Switch smoothly, bringing left elbow toward right knee while extending left leg.',
      'Repeat in a steady, controlled pedaling motion without pulling on your neck.',
    ],
    cues: ['Rotate from the ribcage', 'Keep lower back pressed down', 'Do not pull on neck'],
  },
};

export function matchExerciseKey(name: string): string {
  const n = (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (n.includes('chinup') || n.includes('pullup')) return 'chin_ups';
  if (n.includes('chestsupport') || (n.includes('dumbbell') && n.includes('row')) || n.includes('row')) return 'chest_supported_row';
  if (n.includes('pullover')) return 'dumbbell_pullover';
  if (n.includes('reardelt') || (n.includes('delt') && n.includes('fly')) || n.includes('fly')) return 'rear_delt_fly';
  if (n.includes('shrug')) return 'dumbbell_shrug';
  if (n.includes('incline') && n.includes('curl')) return 'incline_curl';
  if (n.includes('curl')) return 'incline_curl';
  if (n.includes('suitcase') || n.includes('carry')) return 'suitcase_carry';
  if (n.includes('burpee')) return 'half_burpees';
  if (n.includes('climber')) return 'mountain_climbers';
  if (n.includes('chair') && n.includes('squat')) return 'chair_squats';
  if (n.includes('bicycle') || n.includes('crunch')) return 'bicycle_crunches';
  if (n.includes('lunge')) return 'backward_lunge';
  if (n.includes('jumpingjack') || n.includes('jack')) return 'jumping_jacks';
  if (n.includes('wallpush') || n.includes('pushup')) return 'wall_push_ups';
  if (n.includes('squat')) return 'squats';
  return 'backward_lunge';
}

interface AnimationProps {
  exerciseName: string;
  variant?: 'thumb' | 'large';
  mode?: 'animation' | 'muscle' | 'guide';
}

export function ExerciseAnimation({ exerciseName, variant = 'thumb', mode = 'animation' }: AnimationProps) {
  const key = matchExerciseKey(exerciseName);
  const isLarge = variant === 'large';
  const width = isLarge ? '100%' : '56px';
  const height = isLarge ? '260px' : '56px';
  const isMuscle = mode === 'muscle';

  // Aesthetic colors
  const skin = '#F6C8A6';
  const hair = '#1E293B';
  const tank = isMuscle ? '#1E293B' : '#2563EB';
  const shorts = '#0F172A';
  const shoes = '#334155';
  const sole = '#E2E8F0';
  const highlight = '#E2F163'; // Health OS Neon Accent for muscles

  return (
    <div
      className={`exercise-vector-box ${variant}`}
      style={{
        width,
        height,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: isLarge ? 18 : 10,
        background: isLarge
          ? 'radial-gradient(circle at 50% 40%, rgba(37,99,235,0.08) 0%, rgba(15,23,42,0.4) 100%)'
          : 'rgba(255,255,255,0.03)',
        border: isLarge ? '1px solid var(--line)' : 'none',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <svg
        viewBox="0 0 200 200"
        style={{ width: '100%', height: '100%', maxHeight: isLarge ? 260 : 56 }}
      >
        <defs>
          <radialGradient id={`glow-${key}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#38BDF8" stopOpacity="0" />
          </radialGradient>
        </defs>

        <style>{`
          @keyframes lungeAnim {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(22px); }
          }
          @keyframes jackArms {
            0%, 100% { transform: rotate(0deg); }
            50% { transform: rotate(-140deg); }
          }
          @keyframes jackLegs {
            0%, 100% { transform: scaleX(1); }
            50% { transform: scaleX(1.45); }
          }
          @keyframes squatAnim {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(30px) scaleY(0.85); }
          }
          @keyframes pushupAnim {
            0%, 100% { transform: translateX(0); }
            50% { transform: translateX(18px); }
          }
          @keyframes chinupAnim {
            0%, 100% { transform: translateY(25px); }
            50% { transform: translateY(-12px); }
          }
          @keyframes rowAnim {
            0%, 100% { transform: translateY(12px); }
            50% { transform: translateY(-10px); }
          }
          @keyframes curlAnim {
            0%, 100% { transform: rotate(0deg); }
            50% { transform: rotate(-110deg); }
          }
          @keyframes shrugAnim {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-8px); }
          }
          @keyframes groundPulse {
            0%, 100% { transform: scaleX(1); opacity: 0.35; }
            50% { transform: scaleX(1.2); opacity: 0.6; }
          }
        `}</style>

        {/* Dynamic Exercise Rendering based on matched key */}
        {key === 'backward_lunge' && (
          <g>
            <ellipse cx="100" cy="180" rx="42" ry="6" fill="#000" opacity="0.3" style={{ animation: 'groundPulse 2.4s infinite ease-in-out', transformOrigin: '100px 180px' }} />
            <g style={{ animation: 'lungeAnim 2.4s infinite ease-in-out', transformOrigin: '100px 180px' }}>
              <path d="M 98 120 L 70 145 L 68 175" stroke={shorts} strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              <path d="M 68 175 L 56 177" stroke={shoes} strokeWidth="8" strokeLinecap="round" fill="none" />
              <path d="M 56 177 L 68 177" stroke={sole} strokeWidth="3" strokeLinecap="round" fill="none" />

              <path d="M 104 120 L 126 142 L 124 175" stroke={shorts} strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              {isMuscle && <path d="M 104 120 L 126 142" stroke={highlight} strokeWidth="13" strokeLinecap="round" opacity="0.8" />}
              <path d="M 124 175 L 140 176" stroke={shoes} strokeWidth="8" strokeLinecap="round" fill="none" />
              <path d="M 124 178 L 142 178" stroke={sole} strokeWidth="3" strokeLinecap="round" fill="none" />

              <path d="M 100 68 L 100 120" stroke={tank} strokeWidth="22" strokeLinecap="round" />
              {isMuscle && <circle cx="100" cy="122" r="10" fill={highlight} opacity="0.85" />}

              <circle cx="100" cy="46" r="13" fill={skin} />
              <path d="M 93 42 C 93 33 107 33 107 42 C 107 45 93 45 93 42 Z" fill={hair} />
              <circle cx="103" cy="44" r="2.5" fill="#1E293B" />

              <path d="M 93 72 L 82 92 L 94 98" stroke={skin} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              <path d="M 107 72 L 118 92 L 106 98" stroke={skin} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </g>
          </g>
        )}

        {key === 'jumping_jacks' && (
          <g>
            <ellipse cx="100" cy="182" rx="35" ry="6" fill="#000" opacity="0.3" style={{ animation: 'groundPulse 1.2s infinite ease-in-out', transformOrigin: '100px 182px' }} />
            <g style={{ animation: 'squatAnim 1.2s infinite ease-in-out', transformOrigin: '100px 180px' }}>
              <g style={{ animation: 'jackLegs 1.2s infinite ease-in-out', transformOrigin: '100px 120px' }}>
                <path d="M 96 115 L 82 170 L 76 174" stroke={shorts} strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                <path d="M 104 115 L 118 170 L 124 174" stroke={shorts} strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                <circle cx="75" cy="174" r="4.5" fill={shoes} />
                <circle cx="125" cy="174" r="4.5" fill={shoes} />
              </g>

              <path d="M 100 68 L 100 116" stroke={tank} strokeWidth="22" strokeLinecap="round" />
              <circle cx="100" cy="46" r="13" fill={skin} />
              <path d="M 92 42 C 92 32 108 32 108 42 Z" fill={hair} />

              <g style={{ animation: 'jackArms 1.2s infinite ease-in-out', transformOrigin: '90px 70px' }}>
                <path d="M 90 70 L 60 100 L 52 105" stroke={skin} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </g>

              <g style={{ animation: 'jackArms 1.2s infinite ease-in-out', transformOrigin: '110px 70px', transform: 'scaleX(-1)', transformBox: 'fill-box' }}>
                <path d="M 110 70 L 140 100 L 148 105" stroke={skin} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </g>
            </g>
          </g>
        )}

        {(key === 'squats' || key === 'chair_squats') && (
          <g>
            <ellipse cx="100" cy="180" rx="38" ry="6" fill="#000" opacity="0.3" style={{ animation: 'groundPulse 2.2s infinite ease-in-out', transformOrigin: '100px 180px' }} />
            <g style={{ animation: 'squatAnim 2.2s infinite ease-in-out', transformOrigin: '100px 180px' }}>
              <path d="M 92 118 L 84 148 L 84 175" stroke={shorts} strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              <path d="M 108 118 L 116 148 L 116 175" stroke={shorts} strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              {isMuscle && (
                <>
                  <path d="M 92 118 L 84 148" stroke={highlight} strokeWidth="13" strokeLinecap="round" opacity="0.8" />
                  <path d="M 108 118 L 116 148" stroke={highlight} strokeWidth="13" strokeLinecap="round" opacity="0.8" />
                </>
              )}
              <path d="M 84 175 L 75 177" stroke={shoes} strokeWidth="8" strokeLinecap="round" fill="none" />
              <path d="M 116 175 L 125 177" stroke={shoes} strokeWidth="8" strokeLinecap="round" fill="none" />

              <path d="M 100 68 L 100 118" stroke={tank} strokeWidth="22" strokeLinecap="round" />
              <circle cx="100" cy="46" r="13" fill={skin} />
              <path d="M 92 42 C 92 32 108 32 108 42 Z" fill={hair} />

              <path d="M 94 72 L 75 88 L 60 92" stroke={skin} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              <path d="M 106 72 L 125 88 L 140 92" stroke={skin} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </g>
          </g>
        )}

        {key === 'wall_push_ups' && (
          <g>
            <line x1="165" y1="30" x2="165" y2="185" stroke="#475569" strokeWidth="5" strokeLinecap="round" strokeDasharray="3 3" />
            <g style={{ animation: 'pushupAnim 2.2s infinite ease-in-out', transformOrigin: '60px 175px' }}>
              <path d="M 70 170 L 135 78" stroke={shorts} strokeWidth="13" strokeLinecap="round" fill="none" />
              <path d="M 110 112 L 140 76" stroke={tank} strokeWidth="20" strokeLinecap="round" fill="none" />
              {isMuscle && <circle cx="130" cy="88" r="10" fill={highlight} opacity="0.85" />}

              <circle cx="148" cy="62" r="12" fill={skin} />
              <path d="M 143 56 C 143 48 156 48 156 56 Z" fill={hair} />

              <path d="M 132 80 L 152 88 L 165 88" stroke={skin} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              <path d="M 70 170 L 62 176" stroke={shoes} strokeWidth="8" strokeLinecap="round" fill="none" />
            </g>
          </g>
        )}

        {key === 'chin_ups' && (
          <g>
            <line x1="30" y1="35" x2="170" y2="35" stroke="#64748B" strokeWidth="6" strokeLinecap="round" />
            <circle cx="85" cy="35" r="4" fill="#94A3B8" />
            <circle cx="115" cy="35" r="4" fill="#94A3B8" />

            <g style={{ animation: 'chinupAnim 2.4s infinite ease-in-out', transformOrigin: '100px 35px' }}>
              <circle cx="85" cy="37" r="5" fill={skin} />
              <circle cx="115" cy="37" r="5" fill={skin} />

              <path d="M 85 37 L 88 56 L 94 72" stroke={skin} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              <path d="M 115 37 L 112 56 L 106 72" stroke={skin} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              {isMuscle && (
                <>
                  <circle cx="88" cy="56" r="6" fill={highlight} opacity="0.85" />
                  <circle cx="112" cy="56" r="6" fill={highlight} opacity="0.85" />
                </>
              )}

              <circle cx="100" cy="58" r="13" fill={skin} />
              <path d="M 92 54 C 92 44 108 44 108 54 Z" fill={hair} />

              <path d="M 100 75 L 100 120" stroke={tank} strokeWidth="22" strokeLinecap="round" />
              {isMuscle && (
                <>
                  <path d="M 90 85 L 94 110" stroke={highlight} strokeWidth="7" strokeLinecap="round" opacity="0.9" />
                  <path d="M 110 85 L 106 110" stroke={highlight} strokeWidth="7" strokeLinecap="round" opacity="0.9" />
                </>
              )}

              <path d="M 96 120 L 98 155 L 103 175" stroke={shorts} strokeWidth="11" strokeLinecap="round" fill="none" />
              <path d="M 104 120 L 102 155 L 97 175" stroke={shorts} strokeWidth="11" strokeLinecap="round" fill="none" />
              <circle cx="100" cy="177" r="5" fill={shoes} />
            </g>
          </g>
        )}

        {key === 'chest_supported_row' && (
          <g>
            <line x1="70" y1="130" x2="135" y2="70" stroke="#475569" strokeWidth="8" strokeLinecap="round" />
            <line x1="102" y1="100" x2="102" y2="175" stroke="#334155" strokeWidth="6" strokeLinecap="round" />

            <g>
              <path d="M 80 125 L 130 80" stroke={tank} strokeWidth="20" strokeLinecap="round" fill="none" />
              {isMuscle && <path d="M 88 115 L 118 88" stroke={highlight} strokeWidth="9" strokeLinecap="round" opacity="0.85" />}

              <circle cx="140" cy="68" r="12" fill={skin} />
              <path d="M 135 60 C 135 52 148 52 148 60 Z" fill={hair} />

              <path d="M 75 130 L 60 170" stroke={shorts} strokeWidth="11" strokeLinecap="round" fill="none" />
              <circle cx="60" cy="172" r="5" fill={shoes} />

              <g style={{ animation: 'rowAnim 2.2s infinite ease-in-out', transformOrigin: '115px 85px' }}>
                <path d="M 115 85 L 110 115 L 105 135" stroke={skin} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                <rect x="95" y="132" width="20" height="6" rx="3" fill="#94A3B8" />
                <circle cx="95" cy="135" r="7" fill="#64748B" />
                <circle cx="115" cy="135" r="7" fill="#64748B" />
              </g>
            </g>
          </g>
        )}

        {key === 'incline_curl' && (
          <g>
            <line x1="85" y1="50" x2="65" y2="150" stroke="#475569" strokeWidth="8" strokeLinecap="round" />
            <line x1="65" y1="150" x2="110" y2="150" stroke="#475569" strokeWidth="8" strokeLinecap="round" />

            <path d="M 85 75 L 75 145" stroke={tank} strokeWidth="22" strokeLinecap="round" fill="none" />
            <circle cx="90" cy="55" r="12" fill={skin} />
            <path d="M 84 48 C 84 40 96 40 96 48 Z" fill={hair} />

            <path d="M 75 145 L 115 148 L 115 178" stroke={shorts} strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            <circle cx="116" cy="180" r="5" fill={shoes} />

            <path d="M 85 85 L 88 120" stroke={skin} strokeWidth="7" strokeLinecap="round" fill="none" />
            {isMuscle && <circle cx="90" cy="115" r="8" fill={highlight} opacity="0.9" />}
            
            <g style={{ animation: 'curlAnim 2.2s infinite ease-in-out', transformOrigin: '88px 120px' }}>
              <path d="M 88 120 L 105 145" stroke={skin} strokeWidth="7" strokeLinecap="round" fill="none" />
              <circle cx="105" cy="145" r="7" fill="#64748B" />
              <rect x="98" y="142" width="14" height="6" rx="2" fill="#94A3B8" />
            </g>
          </g>
        )}

        {key === 'dumbbell_shrug' && (
          <g>
            <ellipse cx="100" cy="180" rx="35" ry="6" fill="#000" opacity="0.3" style={{ animation: 'groundPulse 2s infinite ease-in-out', transformOrigin: '100px 180px' }} />
            <path d="M 93 120 L 91 175" stroke={shorts} strokeWidth="12" strokeLinecap="round" fill="none" />
            <path d="M 107 120 L 109 175" stroke={shorts} strokeWidth="12" strokeLinecap="round" fill="none" />
            <circle cx="90" cy="177" r="5" fill={shoes} />
            <circle cx="110" cy="177" r="5" fill={shoes} />

            <g style={{ animation: 'shrugAnim 2s infinite ease-in-out', transformOrigin: '100px 120px' }}>
              <path d="M 100 68 L 100 120" stroke={tank} strokeWidth="22" strokeLinecap="round" />
              {isMuscle && (
                <path d="M 88 68 L 100 62 L 112 68" stroke={highlight} strokeWidth="8" strokeLinecap="round" fill="none" opacity="0.9" />
              )}

              <circle cx="100" cy="46" r="13" fill={skin} />
              <path d="M 92 40 C 92 30 108 30 108 40 Z" fill={hair} />

              <path d="M 89 72 L 78 125" stroke={skin} strokeWidth="7" strokeLinecap="round" fill="none" />
              <circle cx="78" cy="128" r="8" fill="#64748B" />
              <rect x="70" y="125" width="16" height="6" rx="2" fill="#94A3B8" />

              <path d="M 111 72 L 122 125" stroke={skin} strokeWidth="7" strokeLinecap="round" fill="none" />
              <circle cx="122" cy="128" r="8" fill="#64748B" />
              <rect x="114" y="125" width="16" height="6" rx="2" fill="#94A3B8" />
            </g>
          </g>
        )}

        {/* Fallback clean generic vector if none of the above */}
        {![
          'backward_lunge',
          'jumping_jacks',
          'squats',
          'chair_squats',
          'wall_push_ups',
          'chin_ups',
          'chest_supported_row',
          'incline_curl',
          'dumbbell_shrug',
        ].includes(key) && (
          <g>
            <ellipse cx="100" cy="180" rx="36" ry="6" fill="#000" opacity="0.3" style={{ animation: 'groundPulse 2s infinite ease-in-out', transformOrigin: '100px 180px' }} />
            <g style={{ animation: 'lungeAnim 2s infinite ease-in-out', transformOrigin: '100px 180px' }}>
              <path d="M 93 120 L 88 175" stroke={shorts} strokeWidth="12" strokeLinecap="round" fill="none" />
              <path d="M 107 120 L 112 175" stroke={shorts} strokeWidth="12" strokeLinecap="round" fill="none" />
              <circle cx="88" cy="177" r="5" fill={shoes} />
              <circle cx="112" cy="177" r="5" fill={shoes} />

              <path d="M 100 68 L 100 120" stroke={tank} strokeWidth="22" strokeLinecap="round" />
              <circle cx="100" cy="46" r="13" fill={skin} />
              <path d="M 92 40 C 92 30 108 30 108 40 Z" fill={hair} />

              <path d="M 89 72 L 76 110" stroke={skin} strokeWidth="7" strokeLinecap="round" fill="none" />
              <path d="M 111 72 L 124 110" stroke={skin} strokeWidth="7" strokeLinecap="round" fill="none" />
            </g>
          </g>
        )}
      </svg>

      {/* Mini live indicator badge on large view */}
      {isLarge && (
        <div
          style={{
            position: 'absolute',
            bottom: 12,
            right: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 8px',
            borderRadius: 12,
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(6px)',
            fontSize: 10,
            fontWeight: 700,
            color: '#38BDF8',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              backgroundColor: '#38BDF8',
              boxShadow: '0 0 8px #38BDF8',
            }}
          />
          2D Vector · Loop
        </div>
      )}
    </div>
  );
}
