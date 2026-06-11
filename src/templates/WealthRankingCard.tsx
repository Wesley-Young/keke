export interface WealthRankingEntry {
  rank: number;
  nickname: string;
  userId: number | string;
  amount: number;
}

export interface WealthRankingCardProps {
  entries: readonly WealthRankingEntry[];
}

export default function WealthRankingCard({ entries }: WealthRankingCardProps) {
  return (
    <div
      style={{
        width: 720,
        backgroundColor: '#fff',
        color: '#1f2933',
        fontFamily: 'Inter, Noto Sans SC',
        padding: 28,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          borderBottom: '3px solid #24313d',
          paddingBottom: 18,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 17,
              color: '#ef6f6c',
              marginBottom: 4,
            }}
          >
            TOP 10
          </div>
          <div
            style={{
              fontSize: 38,
              fontWeight: 800,
              lineHeight: 1.1,
            }}
          >
            富豪榜
          </div>
        </div>
      </div>

      <section
        style={{
          backgroundColor: '#fffdf4',
          border: '2px solid #edd7b2',
          borderRadius: 8,
          marginTop: 22,
          padding: 18,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {entries.map((entry, index) => {
            const colors =
              index === 0
                ? {
                    background: '#fff3c7',
                    border: '#f2bd5f',
                    rank: '#ef8f00',
                  }
                : index === 1
                  ? {
                      background: '#edf7ff',
                      border: '#6bb6ff',
                      rank: '#2986cc',
                    }
                  : index === 2
                    ? {
                        background: '#e9fbf2',
                        border: '#58c58b',
                        rank: '#21895b',
                      }
                    : {
                        background: '#ffffff',
                        border: '#e3e8ef',
                        rank: '#667085',
                      };

            return (
              <div
                key={`${entry.rank}-${entry.userId}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  backgroundColor: colors.background,
                  border: `2px solid ${colors.border}`,
                  borderRadius: 8,
                  padding: '12px 14px',
                }}
              >
                <div
                  style={{
                    width: 58,
                    color: colors.rank,
                    fontFamily: 'Roboto Mono',
                    fontSize: 22,
                    fontWeight: 800,
                  }}
                >
                  #{entry.rank}
                </div>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 750,
                      lineHeight: 1.2,
                    }}
                  >
                    {entry.nickname || entry.userId}
                  </div>
                  <div
                    style={{
                      color: '#667085',
                      fontSize: 14,
                      marginTop: 3,
                    }}
                  >
                    QQ {entry.userId}
                  </div>
                </div>
                <div
                  style={{
                    fontFamily: 'Roboto Mono',
                    fontSize: 22,
                    fontWeight: 800,
                  }}
                >
                  {entry.amount}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export const previewProps: WealthRankingCardProps = {
  entries: [
    { rank: 1, nickname: 'T4kum1', userId: 10001, amount: 1280000 },
    { rank: 2, nickname: '椰奶冰', userId: 10002, amount: 960500 },
    { rank: 3, nickname: '小羊不会睡', userId: 10003, amount: 751200 },
    { rank: 4, nickname: 'Mint', userId: 10004, amount: 620000 },
    { rank: 5, nickname: '', userId: 10005, amount: 58111 }, // no nickname
  ],
};
