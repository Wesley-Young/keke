export default function BombUsageCard() {
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
          alignItems: 'flex-end',
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
            主要玩法
          </div>
          <div
            style={{
              fontSize: 38,
              fontWeight: 800,
              lineHeight: 1.1,
            }}
          >
            炸弹
          </div>
        </div>
        <div
          style={{
            fontSize: 16,
            color: '#667085',
            paddingTop: 6,
          }}
        >
          仅限在官方群使用
        </div>
      </div>

      <section
        style={{
          backgroundColor: '#fffdf4',
          border: '2px solid #f2bd5f',
          borderRadius: 8,
          marginTop: 22,
          padding: 18,
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.4fr 0.9fr',
            gap: 14,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              ['01', '补货', '发送【购买炸弹】购买炸弹，5W微壳/个'],
              [
                '02',
                '开火',
                '使用【炸弹@某人】攻击对方，消耗1个炸弹和体力/魅力',
              ],
              ['03', '结果', '对方越富收益越高，但反噬也越重'],
            ].map(([step, title, text]) => (
              <div
                key={step}
                style={{
                  display: 'flex',
                  gap: 12,
                  alignItems: 'stretch',
                  backgroundColor: '#fff',
                  border: '2px solid #f4d48a',
                  borderRadius: 8,
                  padding: 12,
                }}
              >
                <div
                  style={{
                    width: 54,
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: '#fff3c7',
                    border: '2px solid #f2bd5f',
                    borderRadius: 8,
                    color: '#af6a00',
                    fontFamily: 'Roboto Mono',
                    fontSize: 16,
                    fontWeight: 800,
                  }}
                >
                  {step}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 800,
                      marginBottom: 4,
                    }}
                  >
                    {title}
                  </div>
                  <div style={{ fontSize: 18, lineHeight: 1.45 }}>{text}</div>
                </div>
              </div>
            ))}
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div
              style={{
                backgroundColor: '#ffffff',
                border: '2px solid #edd7b2',
                borderRadius: 8,
                padding: 14,
              }}
            >
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 800,
                  marginBottom: 8,
                }}
              >
                关键限制
              </div>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div style={{ fontSize: 16 }}>
                  每人每
                  <span style={{ fontWeight: 800 }}>1分钟</span>
                  可用
                  <span style={{ fontWeight: 800 }}>1次</span>
                </div>
                <div style={{ fontSize: 16 }}>
                  对方微壳低于
                  <span style={{ fontWeight: 800 }}>5W</span>
                  时无法攻击
                </div>
                <div style={{ fontSize: 16 }}>
                  抢夺不会超过对方当前财产的
                  <span style={{ fontWeight: 800 }}>20%</span>
                </div>
              </div>
            </div>

            <div
              style={{
                backgroundColor: '#1f2933',
                color: '#fff',
                borderRadius: 8,
                padding: 14,
              }}
            >
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 800,
                  marginBottom: 8,
                }}
              >
                结果提示
              </div>
              <div style={{ fontSize: 16, lineHeight: 1.5 }}>
                成功会抢走微壳
              </div>
              <div style={{ fontSize: 16, lineHeight: 1.5 }}>
                失败会被反噬并且禁言
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
