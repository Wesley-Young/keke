export default function FishingUsageCard() {
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
            主要玩法
          </div>
          <div
            style={{
              fontSize: 38,
              fontWeight: 800,
              lineHeight: 1.1,
            }}
          >
            钓鱼
          </div>
        </div>
      </div>

      <section
        style={{
          backgroundColor: '#edf7ff',
          border: '2px solid #6bb6ff',
          borderRadius: 8,
          marginTop: 22,
          padding: 18,
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 12,
          }}
        >
          {[
            ['01', '开局', '先发送【购买鱼竿】'],
            ['02', '钓鱼', '发送【钓鱼】，自动花费1W微壳购买鱼饵'],
            ['03', '收网', '发送【卖鱼】出售收获的物品'],
          ].map(([step, title, text]) => (
            <div
              key={step}
              style={{
                backgroundColor: '#ffffff',
                border: '2px solid #b8daf7',
                borderRadius: 8,
                padding: 14,
                minHeight: 136,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                }}
              >
                <div
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: 8,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: '#dff0ff',
                    border: '2px solid #6bb6ff',
                    color: '#1d6fb2',
                    fontFamily: 'Roboto Mono',
                    fontSize: 15,
                    fontWeight: 800,
                  }}
                >
                  {step}
                </div>
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 800,
                    color: '#1d6fb2',
                  }}
                >
                  {title}
                </div>
              </div>
              <div style={{ fontSize: 17, lineHeight: 1.5 }}>{text}</div>
            </div>
          ))}
          <div
            style={{
              gridColumn: '1 / -1',
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 12,
            }}
          >
            <div
              style={{
                backgroundColor: '#ffffff',
                border: '2px solid #b8daf7',
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
                体力门槛
              </div>
              <div style={{ fontSize: 17, lineHeight: 1.5 }}>
                每次钓鱼消耗
                <span style={{ fontWeight: 800 }}>5-20体力</span>，体力至少需要
                <span style={{ fontWeight: 800 }}>20</span>。
              </div>
              <div style={{ fontSize: 17, lineHeight: 1.5 }}>
                可以通过【
                <span style={{ fontWeight: 800 }}>签到</span>
                】或【
                <span style={{ fontWeight: 800 }}>购买体力</span>
                】来获得额外体力
              </div>
            </div>
            <div
              style={{
                backgroundColor: '#f4faff',
                border: '2px solid #6bb6ff',
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
                出售方式
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 17, lineHeight: 1.5 }}>
                  发送【
                  <span style={{ fontWeight: 800 }}>卖鱼 物品名</span>
                  】出售单个物品
                </div>
                <div style={{ fontSize: 17, lineHeight: 1.5 }}>
                  发送【
                  <span style={{ fontWeight: 800 }}>卖鱼 物品名 数量</span>
                  】批量出售指定数量的物品
                </div>
                <div style={{ fontSize: 17, lineHeight: 1.5 }}>
                  可指定多组物品，例如【
                  <span style={{ fontWeight: 800 }}>
                    卖鱼 物品1数量1 物品2数量2 物品3数量3
                  </span>
                  】
                </div>
                <div style={{ fontSize: 17, lineHeight: 1.5 }}>
                  发送【
                  <span style={{ fontWeight: 800 }}>卖鱼 全部</span>
                  】一次卖掉所有收获
                </div>
                <div
                  style={{ fontSize: 16, lineHeight: 1.5, color: '#667085' }}
                >
                  鱼库囤太满可能遭窃，及时卖鱼可以降低被偷风险
                </div>
              </div>
            </div>
          </div>
          <div
            style={{
              gridColumn: '1 / -1',
              backgroundColor: '#fff7f7',
              border: '2px solid #ef9a9a',
              borderRadius: 8,
              padding: 14,
            }}
          >
            <div
              style={{
                fontSize: 16,
                fontWeight: 800,
                marginBottom: 10,
                color: '#b42318',
              }}
            >
              炸鱼
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 12,
              }}
            >
              {[
                ['效果', '强制让正在钓鱼的人无功而返'],
                ['消耗', '需要1个炸弹、50体力和50魅力'],
                ['代价', '自己被禁言3-5分钟，冷却时间10分钟'],
              ].map(([title, text]) => (
                <div
                  key={title}
                  style={{
                    backgroundColor: '#ffffff',
                    border: '2px solid #f4b6b6',
                    borderRadius: 8,
                    padding: 12,
                    minHeight: 86,
                  }}
                >
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 800,
                      marginBottom: 6,
                      color: '#b42318',
                    }}
                  >
                    {title}
                  </div>
                  <div style={{ fontSize: 17, lineHeight: 1.45 }}>{text}</div>
                </div>
              ))}
            </div>
            <div
              style={{
                fontSize: 16,
                lineHeight: 1.5,
                marginTop: 10,
                color: '#667085',
              }}
            >
              需要有人正在钓鱼才会成功，且仅限在官方群使用
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
