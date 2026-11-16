import { ImageResponse } from 'next/og';

export const alt =
  'StackStress — design an architecture, break it under traffic, and understand why';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

function NodeBox({
  label,
  tone,
  width = 138,
  background = '#f8fbfc',
}: {
  label: string;
  tone: string;
  width?: number;
  background?: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width,
        height: 42,
        border: `2px solid ${tone}`,
        background,
        fontSize: 15,
        fontWeight: 700,
        color: '#15222c',
      }}
    >
      {label}
    </div>
  );
}

function Connector() {
  return (
    <div
      style={{
        display: 'flex',
        width: 2,
        height: 12,
        background: '#8b9aa4',
      }}
    />
  );
}

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: '#e8eef2',
          color: '#15222c',
          padding: '52px 64px 44px',
          fontFamily: 'Arial, Helvetica, sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #8b9aa4',
            paddingBottom: 18,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                display: 'flex',
                width: 14,
                height: 30,
                background: '#0f7a63',
              }}
            />
            <div
              style={{
                display: 'flex',
                fontSize: 26,
                fontWeight: 700,
                letterSpacing: 1,
              }}
            >
              STACKSTRESS
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 14,
              letterSpacing: 2,
              color: '#4e5c66',
            }}
          >
            ARCHITECTURE WORKBENCH / SHEET 01
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            flex: 1,
            gap: 52,
            paddingTop: 40,
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              width: 620,
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                fontSize: 60,
                fontWeight: 700,
                lineHeight: 1.05,
                letterSpacing: -2,
              }}
            >
              <div style={{ display: 'flex' }}>Build it.</div>
              <div style={{ display: 'flex' }}>Break it.</div>
            </div>
            <div
              style={{
                display: 'flex',
                marginTop: 20,
                fontSize: 23,
                lineHeight: 1.35,
                color: '#4e5c66',
              }}
            >
              An executable architecture canvas. Push traffic through your
              system, watch queues, latency, and cost react, then find the exact
              rate where it gives out.
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 30 }}>
              {[
                ['p95', 'live'],
                ['3x spike', 'challenge'],
                ['$ / hr', 'budget'],
              ].map(([value, label]) => (
                <div
                  key={label}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    width: 160,
                    border: '1px solid #c6d2da',
                    background: '#f8fbfc',
                    padding: '10px 16px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      fontSize: 24,
                      fontWeight: 700,
                      color: '#0a5a49',
                    }}
                  >
                    {value}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      marginTop: 2,
                      fontSize: 12,
                      letterSpacing: 1,
                      color: '#5f6d77',
                    }}
                  >
                    {label.toUpperCase()}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              flex: 1,
              flexDirection: 'column',
              border: '1px solid #c6d2da',
              background: '#f8fbfc',
              padding: '16px 20px',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 12,
                letterSpacing: 1.5,
                color: '#4e5c66',
                paddingBottom: 12,
                borderBottom: '1px solid #c6d2da',
              }}
            >
              <div style={{ display: 'flex' }}>SYSTEM UNDER TEST</div>
              <div style={{ display: 'flex', color: '#bc3a2b' }}>
                BOTTLENECK FOUND
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                flex: 1,
                flexDirection: 'column',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 0',
              }}
            >
              <NodeBox label="Traffic" tone="#2f6f95" />
              <Connector />
              <NodeBox label="Balancer" tone="#4f5d8a" />
              <Connector />
              <div style={{ display: 'flex', gap: 18 }}>
                <NodeBox label="API" tone="#0f7a63" />
                <NodeBox label="Cache" tone="#a9680f" />
              </div>
              <Connector />
              <NodeBox
                label="Primary DB"
                tone="#bc3a2b"
                width={170}
                background="#fdf0ee"
              />
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                borderTop: '1px solid #c6d2da',
                paddingTop: 11,
                fontSize: 12,
                color: '#5f6d77',
              }}
            >
              <div style={{ display: 'flex' }}>≤ 800 ms p95</div>
              <div style={{ display: 'flex' }}>≤ 5% errors</div>
              <div style={{ display: 'flex' }}>breaks at 640 rps</div>
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: 24,
            paddingTop: 14,
            borderTop: '1px solid #8b9aa4',
            fontSize: 13,
            letterSpacing: 1,
            color: '#4e5c66',
          }}
        >
          <div style={{ display: 'flex' }}>
            BUILD IT. BREAK IT. UNDERSTAND WHY.
          </div>
          <div style={{ display: 'flex', color: '#0a5a49' }}>
            DETERMINISTIC REPLAY · SHAREABLE RUNS
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
