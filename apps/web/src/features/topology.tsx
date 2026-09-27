import { Card } from '../design-system/components';
import { date, type Snapshot } from './shared';

const stateLabel = { energized: 'Под напряжением', deenergized: 'Отключен', unknown: 'Состояние неизвестно' } as const;
const originLabel = { model: 'по модели', telemetry: 'по телеметрии', manual_verified: 'проверено вручную' } as const;

function layout(topology: Snapshot['topology']) {
  const levels = new Map(topology.nodes.map(node => [node.nodeId, 0]));
  // Traverse the supplied directed connections; the demo topology is acyclic.
  for (let pass = 0; pass < topology.nodes.length; pass += 1) {
    let changed = false;
    for (const edge of topology.edges) {
      const source = levels.get(edge.source);
      const target = levels.get(edge.target);
      if (source !== undefined && target !== undefined && source + 1 > target && source + 1 < topology.nodes.length) {
        levels.set(edge.target, source + 1); changed = true;
      }
    }
    if (!changed) break;
  }
  const columns = new Map<number, typeof topology.nodes>();
  for (const node of topology.nodes) {
    const level = levels.get(node.nodeId) || 0;
    columns.set(level, [...(columns.get(level) || []), node]);
  }
  const width = Math.max(740, (Math.max(...columns.keys()) + 1) * 238 + 28);
  const height = Math.max(186, Math.max(...[...columns.values()].map(nodes => nodes.length)) * 94 + 30);
  const positions = new Map<string, { x: number; y: number }>();
  for (const [level, nodes] of columns) nodes.forEach((node, index) => {
    positions.set(node.nodeId, { x: 18 + level * 238, y: (height - nodes.length * 94) / 2 + index * 94 + 8 });
  });
  return { width, height, positions };
}

export function TopologyCard({ snapshot }: { snapshot: Snapshot }) {
  const topology = snapshot.topology;
  if (!topology.nodes.length) return <Card title="Упрощенная схема" subtitle={topology.label}><p className="feature-muted">Узлы схемы в этом наборе не представлены.</p></Card>;
  const { width, height, positions } = layout(topology);
  const names = new Map(topology.nodes.map(node => [node.nodeId, node.label]));
  return <Card title="Упрощенная схема" subtitle={topology.label}>
    <div className="feature-topology-scroll"><svg className="feature-topology-diagram" viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label="Схема связей оборудования с состояниями по данным модели, телеметрии или проверки">
      <title>Схема связей оборудования</title>
      {topology.edges.map((edge, index) => {
        const start = positions.get(edge.source);
        const end = positions.get(edge.target);
        if (!start || !end) return null;
        const x1 = start.x + 190; const y1 = start.y + 34; const x2 = end.x; const y2 = end.y + 34;
        return <path key={`${edge.source}-${edge.target}-${index}`} className={`feature-topology-edge feature-topology-edge-${edge.state}`} d={`M ${x1} ${y1} C ${x1 + 24} ${y1}, ${x2 - 24} ${y2}, ${x2} ${y2}`} />;
      })}
      {topology.nodes.map(node => {
        const point = positions.get(node.nodeId)!;
        const words = node.label.split(' ');
        const first = words.length > 3 ? words.slice(0, 3).join(' ') : node.label;
        const second = words.length > 3 ? words.slice(3).join(' ') : '';
        return <g key={node.nodeId} className={`feature-topology-svg-node feature-topology-svg-node-${node.state}`} transform={`translate(${point.x} ${point.y})`}>
          <rect width="190" height="68" rx="7" /><circle cx="19" cy="19" r="7" /><text x="34" y="23" className="feature-topology-svg-title">{first}</text>{second && <text x="34" y="39" className="feature-topology-svg-title">{second}</text>}
          <text x="34" y="58" className="feature-topology-svg-detail">{stateLabel[node.state]} · {originLabel[node.origin]}</text>
        </g>;
      })}
    </svg></div>
    <div className="feature-topology-legend"><span className="feature-topology-legend-energized">● Под напряжением</span><span className="feature-topology-legend-deenergized">● Отключен</span><span className="feature-topology-legend-unknown">◌ Состояние неизвестно</span></div>
    <details className="feature-details"><summary>Состав и связи схемы</summary><ul>{topology.nodes.map(node => <li key={node.nodeId}>{node.label}: {stateLabel[node.state].toLowerCase()}, {originLabel[node.origin]}, на {date(node.observedAt)}</li>)}</ul>{topology.edges.length > 0 && <ul>{topology.edges.map((edge, index) => <li key={index}>{names.get(edge.source) || edge.source} → {names.get(edge.target) || edge.target}: {stateLabel[edge.state].toLowerCase()}</li>)}</ul>}</details>
    <p className="feature-footnote">Состояние по модели не является подтвержденным положением аппарата. Серый узел означает неизвестное состояние.</p>
  </Card>;
}
