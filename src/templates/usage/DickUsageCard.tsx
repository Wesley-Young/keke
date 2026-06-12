export default function DickUsageCard() {
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
            牛牛大作战
          </div>
        </div>
      </div>

      <section
        style={{
          backgroundColor: '#e9fbf2',
          border: '2px solid #58c58b',
          borderRadius: 8,
          marginTop: 22,
          padding: 18,
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 14,
          }}
        >
          <div
            style={{
              backgroundColor: '#fff',
              border: '2px solid #a5e0bf',
              borderRadius: 8,
              padding: 14,
            }}
          >
            <div
              style={{
                fontSize: 16,
                fontWeight: 800,
                marginBottom: 10,
              }}
            >
              入门
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 17 }}>
                发送【<span style={{ fontWeight: 800 }}>注册牛牛</span>】
              </div>
              <div style={{ fontSize: 17 }}>
                发送【
                <span style={{ fontWeight: 800 }}>我的牛牛</span>
                】查看当前长度
              </div>
              <div style={{ fontSize: 17 }}>
                发送【<span style={{ fontWeight: 800 }}>打搅</span>
                】尝试增长牛牛
              </div>
              <div style={{ fontSize: 17 }}>
                发送【<span style={{ fontWeight: 800 }}>扣</span>
                】尝试脱离负长度困境
              </div>
            </div>
          </div>

          <div
            style={{
              backgroundColor: '#f3fff7',
              border: '2px solid #58c58b',
              borderRadius: 8,
              padding: 14,
            }}
          >
            <div
              style={{
                fontSize: 16,
                fontWeight: 800,
                marginBottom: 10,
              }}
            >
              对决
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 17 }}>
                发送【
                <span style={{ fontWeight: 800 }}>
                  勾引 / 击剑 / 撅 / 磨豆腐 @目标
                </span>
                】与别人对决
              </div>
              <div style={{ fontSize: 17 }}>
                <span style={{ fontWeight: 800 }}>勾引</span>： 你为负，对方为正
              </div>
              <div style={{ fontSize: 17 }}>
                <span style={{ fontWeight: 800 }}>击剑</span>： 双方都为正
              </div>
              <div style={{ fontSize: 17 }}>
                <span style={{ fontWeight: 800 }}>撅</span>： 你为正，对方为负
              </div>
              <div style={{ fontSize: 17 }}>
                <span style={{ fontWeight: 800 }}>磨豆腐</span>： 双方都为负
              </div>
            </div>
          </div>

          <div
            style={{
              gridColumn: '1 / -1',
              backgroundColor: '#fffaf0',
              border: '2px solid #f4c067',
              borderRadius: 8,
              padding: 14,
            }}
          >
            <div
              style={{
                fontSize: 16,
                fontWeight: 800,
                marginBottom: 10,
              }}
            >
              消费
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 12,
              }}
            >
              <div style={{ fontSize: 17, lineHeight: 1.5 }}>
                发送【
                <span style={{ fontWeight: 800 }}>购买长度 10</span>
                】增加
                <span style={{ fontWeight: 800 }}>0.10cm</span>。
              </div>
              <div style={{ fontSize: 17, lineHeight: 1.5 }}>
                发送【
                <span style={{ fontWeight: 800 }}>购买深度 10</span>
                】减少
                <span style={{ fontWeight: 800 }}>0.10cm</span>。
              </div>
            </div>
            <div
              style={{
                fontSize: 17,
                lineHeight: 1.5,
                marginTop: 10,
              }}
            >
              价格为
              <span style={{ fontWeight: 800 }}>30W微壳/厘米</span>
              ，数量必须是正整数。
            </div>
          </div>

          <div
            style={{
              gridColumn: '1 / -1',
              backgroundColor: '#ffffff',
              border: '2px solid #c9efdb',
              borderRadius: 8,
              padding: 14,
            }}
          >
            <div
              style={{
                fontSize: 16,
                fontWeight: 800,
                marginBottom: 10,
              }}
            >
              冷却
            </div>
            <div style={{ fontSize: 17, lineHeight: 1.5 }}>
              打搅、扣、对决相关命令的冷却时间为
              <span style={{ fontWeight: 800 }}>30秒</span>。
            </div>
          </div>

          <div
            style={{
              gridColumn: '1 / -1',
              backgroundColor: '#ffffff',
              border: '2px solid #c9efdb',
              borderRadius: 8,
              padding: 14,
            }}
          >
            <div
              style={{
                fontSize: 16,
                fontWeight: 800,
                marginBottom: 10,
              }}
            >
              重开
            </div>
            <div style={{ fontSize: 17, lineHeight: 1.5 }}>
              发送【<span style={{ fontWeight: 800 }}>割牛牛</span>】花费
              <span style={{ fontWeight: 800 }}>200W微壳</span>重开一次。
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
